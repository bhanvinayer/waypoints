"""Runs the LIVE branch of the pipeline (real SerpClient: API key, cache, budget, no demo flag) against a mocked SerpApi transport."""
import httpx

from app.cache import TTLCache
from app.config import Settings
from app.engine.orchestrator import SearchOrchestrator
from app.schemas import JourneyRequest
from app.serpapi.client import SerpClient, set_serp_client
from app.serpapi.demo_data import demo_respond


def install(calls: list, fail_engines: set[str] | None = None, key="live-key"):
    fail_engines = fail_engines or set()

    def handler(request: httpx.Request):
        params = dict(request.url.params)
        calls.append(params)
        assert params["api_key"] == key and params["output"] == "json"
        if params["engine"] in fail_engines:
            return httpx.Response(500, json={"error": "upstream down"})
        return httpx.Response(200, json=demo_respond(params["engine"], params, "2026-10-03"))

    settings = Settings(serpapi_key=key, max_calls_per_journey=90)
    set_serp_client(SerpClient(settings=settings, cache=TTLCache(None), transport=httpx.MockTransport(handler)))


REQ = dict(origin="Delhi", destination="Jaipur", date="2026-10-03", start_time="08:00", interests=["Street Food"], travel_styles=["food", "culture"], demo=False)


async def test_live_branch_end_to_end(monkeypatch):
    monkeypatch.setenv("SERPAPI_KEY", "live-key")
    from app.config import reset_settings

    reset_settings()
    calls: list = []
    install(calls)
    j = await SearchOrchestrator().discover(JourneyRequest(**REQ))
    assert j.data_mode == "live" and j.waypoints
    engines = {c["engine"] for c in calls}
    assert {"google_maps", "google_maps_directions", "google_maps_reviews", "google_events", "google_news", "google", "google_hotels", "google_flights"} <= engines
    assert all(t.mode == "live" for t in j.trace if t.kind == "serpapi")
    assert j.route.geometry_source == "serpapi_directions"
    assert "live-key" not in j.model_dump_json()
    # a second identical journey is served mostly from the server-side cache
    before = len(calls)
    await SearchOrchestrator().discover(JourneyRequest(**REQ))
    assert len(calls) - before < before * 0.4


async def test_one_failing_source_does_not_break_the_journey(monkeypatch):
    monkeypatch.setenv("SERPAPI_KEY", "live-key")
    from app.config import reset_settings

    reset_settings()
    install([], fail_engines={"google_news", "google_hotels", "google_events"})
    j = await SearchOrchestrator().discover(JourneyRequest(**REQ))
    assert j.waypoints and not j.stay
    assert any("News" in w or "Hotels" in w or "Events" in w for w in j.warnings)  # surfaced, never hidden
    assert all(s.kind != "news" for s in j.signals)  # nothing invented to replace the missing evidence


async def test_total_failure_is_reported_not_hallucinated(monkeypatch):
    import pytest

    from app.engine.orchestrator import DiscoveryError

    monkeypatch.setenv("SERPAPI_KEY", "live-key")
    from app.config import reset_settings

    reset_settings()
    install([], fail_engines={"google_maps", "google_maps_directions", "google_news", "google_events", "google", "google_hotels", "google_flights", "google_maps_reviews"})
    with pytest.raises(DiscoveryError) as exc:
        await SearchOrchestrator().discover(JourneyRequest(**REQ))
    assert exc.value.message == "Live search temporarily unavailable." and exc.value.retriable
