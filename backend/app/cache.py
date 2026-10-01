"""Server-side TTL cache for SerpApi responses.

Key = engine + normalised parameters (the API key is never part of the key and never stored).
TTLs depend on how quickly the underlying information goes stale:
  place details / maps search  -> hours
  reviews                      -> hours
  directions / flights         -> minutes
  events / news                -> minutes
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from pathlib import Path
from typing import Any, Awaitable, Callable

TTL_BY_KIND: dict[str, int] = {
    "google_maps:search": 6 * 3600,
    "google_maps:place": 24 * 3600,
    "google_maps_reviews": 12 * 3600,
    "google_maps_directions": 30 * 60,
    "google": 60 * 60,
    "google_news": 15 * 60,
    "google_events": 20 * 60,
    "google_flights": 30 * 60,
    "google_hotels": 60 * 60,
}


def ttl_for(engine: str, params: dict[str, Any]) -> int:
    if engine == "google_maps":
        return TTL_BY_KIND["google_maps:place" if params.get("type") == "place" else "google_maps:search"]
    return TTL_BY_KIND.get(engine, 600)


def cache_key(engine: str, params: dict[str, Any]) -> str:
    clean = {k: (v.strip().lower() if isinstance(v, str) else v) for k, v in params.items() if k != "api_key" and v is not None}
    raw = json.dumps({"engine": engine, **clean}, sort_keys=True, default=str)
    return f"{engine}:{hashlib.sha1(raw.encode()).hexdigest()}"


class TTLCache:
    def __init__(self, path: Path | None = None, max_entries: int = 2000):
        self._data: dict[str, tuple[float, Any]] = {}
        self._inflight: dict[str, asyncio.Future] = {}
        self._path = path
        self._max = max_entries
        self._last_flush = 0.0
        self._load()

    # ------------------------------------------------------------ persistence
    def _load(self) -> None:
        if not self._path or not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            now = time.time()
            self._data = {k: (exp, v) for k, (exp, v) in raw.items() if exp > now}
        except Exception:
            self._data = {}

    def _flush(self, force: bool = False) -> None:
        if not self._path:
            return
        now = time.time()
        if not force and now - self._last_flush < 5:
            return
        self._last_flush = now
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(json.dumps({k: list(v) for k, v in self._data.items()}), encoding="utf-8")
        except Exception:
            pass

    # ------------------------------------------------------------ API
    def get(self, key: str) -> Any | None:
        item = self._data.get(key)
        if not item:
            return None
        exp, value = item
        if exp < time.time():
            self._data.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl: int) -> None:
        if len(self._data) >= self._max:
            oldest = sorted(self._data.items(), key=lambda kv: kv[1][0])[: self._max // 10]
            for k, _ in oldest:
                self._data.pop(k, None)
        self._data[key] = (time.time() + ttl, value)
        self._flush()

    def clear(self) -> None:
        self._data.clear()
        self._flush(force=True)

    def __len__(self) -> int:
        return len(self._data)

    async def single_flight(self, key: str, producer: Callable[[], Awaitable[Any]]) -> tuple[Any, bool]:
        """Returns (value, was_cached). Concurrent identical requests share one upstream call."""
        hit = self.get(key)
        if hit is not None:
            return hit, True
        if key in self._inflight:
            return await self._inflight[key], True
        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        self._inflight[key] = fut
        try:
            value = await producer()
            fut.set_result(value)
            return value, False
        except Exception as exc:  # propagate to every waiter
            fut.set_exception(exc)
            fut.exception()  # mark retrieved to avoid "never retrieved" warnings
            raise
        finally:
            self._inflight.pop(key, None)
