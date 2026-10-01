import httpx
import pytest

from app import trace
from app.cache import TTLCache, cache_key
from app.config import Settings
from app.serpapi import tools
from app.serpapi.client import SerpApiError, SerpClient, set_serp_client


def make_client(handler, key="SECRET123", max_calls=70):
    settings = Settings(serpapi_key=key)
    client = SerpClient(settings=settings, cache=TTLCache(None), transport=httpx.MockTransport(handler))
    set_serp_client(client)
    ctx = trace.JourneyContext(data_mode="live", max_calls=max_calls)
    return client, ctx


async def test_engine_params_and_trace():
    seen = []

    def handler(request: httpx.Request):
        seen.append(dict(request.url.params))
        return httpx.Response(200, json={"local_results": [{"title": "A"}, {"title": "B"}]})

    _, ctx = make_client(handler)
    with trace.journey_context(ctx):
        data = await tools.search_maps("heritage fort", latitude=27.99, longitude=76.38, zoom=12)
    assert len(data["local_results"]) == 2
    p = seen[0]
    assert p["engine"] == "google_maps" and p["type"] == "search" and p["ll"].startswith("@27.99000,76.38000,12z")
    assert p["api_key"] == "SECRET123"  # sent to SerpApi...
    step = ctx.steps[0]
    assert step.engine == "google_maps" and step.results == 2 and step.query == "heritage fort" and not step.cached
    assert "SECRET123" not in step.model_dump_json()  # ...but never exposed anywhere else


async def test_tools_use_the_right_engines():
    engines = []

    def handler(request: httpx.Request):
        engines.append(request.url.params["engine"])
        return httpx.Response(200, json={})

    _, ctx = make_client(handler)
    with trace.journey_context(ctx):
        await tools.get_directions("Delhi", "Jaipur")
        await tools.get_reviews("0xabc:0xdef")
        await tools.search_events("events in Jaipur", date_filter="weekend")
        await tools.search_news("Jaipur closure")
        await tools.search_web("Amer Fort timings")
        await tools.search_flights("DEL", "JAI", "2026-10-03")
        await tools.search_hotels("hotels in Jaipur", "2026-10-03", "2026-10-04")
        await tools.get_place(place_id="ChIJabc")
    assert engines == ["google_maps_directions", "google_maps_reviews", "google_events", "google_news", "google", "google_flights", "google_hotels", "google_maps"]


async def test_cache_single_flight_and_ttl_key():
    calls = {"n": 0}

    def handler(request: httpx.Request):
        calls["n"] += 1
        return httpx.Response(200, json={"organic_results": [{"title": "x"}]})

    _, ctx = make_client(handler)
    with trace.journey_context(ctx):
        import asyncio

        await asyncio.gather(*[tools.search_web("same query") for _ in range(4)])
        await tools.search_web("Same Query ")  # normalised key
    assert calls["n"] == 1
    assert sum(1 for s in ctx.steps if s.cached) == 4
    assert cache_key("google", {"q": "A", "api_key": "x"}) == cache_key("google", {"q": "a", "api_key": "y"})


async def test_errors_are_scrubbed_and_not_hallucinated():
    def handler(request: httpx.Request):
        return httpx.Response(401, json={"error": "Invalid API key. Your API key should be here: https://serpapi.com?api_key=SECRET123"})

    _, ctx = make_client(handler)
    with trace.journey_context(ctx):
        with pytest.raises(SerpApiError) as exc:
            await tools.search_web("q")
    assert "SECRET123" not in exc.value.message and exc.value.retriable is False
    assert ctx.steps[-1].ok is False and ctx.steps[-1].results is None


async def test_empty_results_are_not_errors():
    def handler(request: httpx.Request):
        return httpx.Response(200, json={"error": "Google Maps hasn't returned any results for this query."})

    _, ctx = make_client(handler)
    with trace.journey_context(ctx):
        data = await tools.search_maps("zzzz", location="nowhere")
    assert data.get("_empty") is True and ctx.steps[-1].results == 0


async def test_call_budget_is_enforced():
    def handler(request: httpx.Request):
        return httpx.Response(200, json={"organic_results": []})

    _, ctx = make_client(handler, max_calls=2)
    with trace.journey_context(ctx):
        await tools.search_web("a")
        await tools.search_web("b")
        with pytest.raises(SerpApiError) as exc:
            await tools.search_web("c")
    assert exc.value.code == "budget_exhausted"


async def test_missing_key_fails_loudly_in_live_mode():
    client = SerpClient(settings=Settings(serpapi_key=""), cache=TTLCache(None))
    set_serp_client(client)
    with trace.journey_context(trace.JourneyContext(data_mode="live")):
        with pytest.raises(SerpApiError) as exc:
            await tools.search_web("q")
    assert exc.value.code == "serpapi_not_configured"
