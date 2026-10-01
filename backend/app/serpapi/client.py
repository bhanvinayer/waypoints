"""Centralised SerpApi client.

Frontend -> FastAPI -> SerpApi. Everything external goes through `SerpClient.call`, which gives us:
  * single place that owns SERPAPI_KEY (never serialised, never logged, scrubbed from errors)
  * server-side TTL cache + single-flight de-duplication
  * per-journey call budget
  * LIVE SEARCH TRACE entries (engine, query, latency, #results, cached)
  * graceful errors (no hallucinated fallbacks)
"""
from __future__ import annotations

import asyncio
import re
import time
from typing import Any

import httpx

from .. import trace
from ..cache import TTLCache, cache_key, ttl_for
from ..config import Settings, get_settings
from ..schemas import TraceStep

SERPAPI_URL = "https://serpapi.com/search.json"

ENGINE_LABEL = {
    "google_maps": "Google Maps",
    "google_maps_reviews": "Google Maps Reviews",
    "google_maps_directions": "Google Maps Directions",
    "google": "Google Search",
    "google_news": "Google News",
    "google_events": "Google Events",
    "google_flights": "Google Flights",
    "google_hotels": "Google Hotels",
}

_EMPTY_HINTS = ("hasn't returned any results", "has not returned any results", "no results", "returned no results")


class SerpApiError(Exception):
    def __init__(self, message: str, code: str = "serpapi_error", retriable: bool = True, status: int | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.retriable = retriable
        self.status = status


def scrub(text: str) -> str:
    return re.sub(r"(api_key=)[^&\s'\"]+", r"\1***", text or "")


def count_results(engine: str, data: dict[str, Any]) -> int:
    if not isinstance(data, dict):
        return 0
    if engine == "google_maps":
        if "place_results" in data:
            return 1
        return len(data.get("local_results") or [])
    if engine == "google_maps_reviews":
        return len(data.get("reviews") or [])
    if engine == "google_maps_directions":
        return len(data.get("directions") or [])
    if engine == "google":
        return len(data.get("organic_results") or [])
    if engine == "google_news":
        return len(data.get("news_results") or [])
    if engine == "google_events":
        return len(data.get("events_results") or [])
    if engine == "google_flights":
        return len(data.get("best_flights") or []) + len(data.get("other_flights") or [])
    if engine == "google_hotels":
        return len(data.get("properties") or [])
    return 0


class SerpClient:
    def __init__(self, settings: Settings | None = None, cache: TTLCache | None = None, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings or get_settings()
        self.cache = cache if cache is not None else TTLCache(self.settings.data_dir / "serp_cache.json")
        self._transport = transport
        self._http: httpx.AsyncClient | None = None
        self._sem = asyncio.Semaphore(6)

    # ------------------------------------------------------------------ http
    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0), transport=self._transport)
        return self._http

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    # ------------------------------------------------------------------ main entry
    async def call(
        self,
        engine: str,
        params: dict[str, Any],
        *,
        phase: str,
        label: str | None = None,
        query: str | None = None,
    ) -> dict[str, Any]:
        ctx = trace.current()
        mode = ctx.data_mode
        params = {k: v for k, v in params.items() if v is not None and v != ""}
        defaults: dict[str, Any] = {"hl": self.settings.hl}
        if engine not in ("google_maps_reviews",):
            defaults["gl"] = self.settings.gl
        params = {**defaults, **params}
        step = TraceStep(
            id=trace.new_step_id(),
            phase=phase,
            kind="serpapi",
            label=label or ENGINE_LABEL.get(engine, engine),
            engine=engine,
            query=query or params.get("q") or params.get("start_addr") or params.get("data_id") or params.get("departure_id"),
            started_at=trace.now_iso(),
            mode=mode,
        )
        t0 = time.perf_counter()

        async def finish(data: dict[str, Any] | None, cached: bool, error: str | None = None) -> None:
            step.latency_ms = int((time.perf_counter() - t0) * 1000)
            step.cached = cached
            step.ok = error is None
            step.error = error
            step.results = count_results(engine, data or {}) if error is None else None
            ctx.add(step)

        try:
            if mode == "demo":
                from .demo_data import demo_respond

                data = demo_respond(engine, params, ctx.journey_date)
                await finish(data, cached=False)
                return data

            if not self.settings.serpapi_configured:
                raise SerpApiError("SERPAPI_KEY is not configured on the server.", code="serpapi_not_configured", retriable=False)

            key = cache_key(engine, params)

            async def producer() -> dict[str, Any]:
                if ctx.calls >= ctx.max_calls:
                    raise SerpApiError(
                        f"SerpApi call budget for this journey ({ctx.max_calls}) is exhausted.", code="budget_exhausted", retriable=False
                    )
                ctx.calls += 1
                return await self._fetch(engine, params)

            data, cached = await self.cache.single_flight(key, producer)
            if not cached:
                self.cache.set(key, data, ttl_for(engine, params))
            await finish(data, cached=cached)
            return data
        except SerpApiError as exc:
            await finish(None, cached=False, error=exc.message)
            raise
        except Exception as exc:  # pragma: no cover - defensive
            err = SerpApiError(scrub(str(exc)) or exc.__class__.__name__)
            await finish(None, cached=False, error=err.message)
            raise err from exc

    # ------------------------------------------------------------------ upstream
    async def _fetch(self, engine: str, params: dict[str, Any]) -> dict[str, Any]:
        query = {**params, "engine": engine, "api_key": self.settings.serpapi_key, "output": "json"}
        last: SerpApiError | None = None
        for attempt in range(3):
            try:
                async with self._sem:
                    resp = await self._client().get(SERPAPI_URL, params=query)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last = SerpApiError(f"SerpApi request failed: {scrub(str(exc)) or exc.__class__.__name__}", code="network")
                await asyncio.sleep(0.6 * (attempt + 1))
                continue

            payload: dict[str, Any] = {}
            try:
                payload = resp.json()
            except Exception:
                payload = {}

            err_text = str(payload.get("error", "")) if isinstance(payload, dict) else ""
            if resp.status_code == 200 and not err_text:
                return payload
            if err_text and any(h in err_text.lower() for h in _EMPTY_HINTS):
                return {**payload, "_empty": True}
            if resp.status_code == 401 or resp.status_code == 403:
                raise SerpApiError("SerpApi rejected the API key.", code="unauthorized", retriable=False, status=resp.status_code)
            if resp.status_code == 429:
                last = SerpApiError("SerpApi rate limit reached.", code="rate_limited", status=429)
                await asyncio.sleep(1.2 * (attempt + 1))
                continue
            if resp.status_code >= 500:
                last = SerpApiError(f"SerpApi upstream error ({resp.status_code}).", code="upstream", status=resp.status_code)
                await asyncio.sleep(0.8 * (attempt + 1))
                continue
            raise SerpApiError(scrub(err_text) or f"SerpApi error ({resp.status_code}).", code="bad_request", retriable=False, status=resp.status_code)
        raise last or SerpApiError("SerpApi request failed.")


_client: SerpClient | None = None


def get_serp_client() -> SerpClient:
    global _client
    if _client is None:
        _client = SerpClient()
    return _client


def set_serp_client(client: SerpClient | None) -> None:
    global _client
    _client = client
