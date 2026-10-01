import time

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def discover(client, **over):
    body = {"origin": "Delhi", "destination": "Jaipur", "date": "2026-10-03", "start_time": "08:00", "demo": True,
            "interests": ["Street Food"], "travel_styles": ["food", "culture", "photography"], **over}
    start = client.post("/api/journey/discover/start", json=body)
    assert start.status_code == 200, start.text
    job_id = start.json()["id"]
    for _ in range(100):
        job = client.get(f"/api/journey/jobs/{job_id}").json()
        if job["status"] != "running":
            return job
        time.sleep(0.1)
    raise AssertionError("discovery did not finish")


def test_health(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["demo_available"] and h["serpapi_configured"] is False
    assert "google_maps_directions" in h["engines"]


def test_discovery_job_reports_real_stages_and_journey_is_fetchable(client):
    job = discover(client)
    assert job["status"] == "done" and job["data_mode"] == "demo"
    assert [s["key"] for s in job["stages"]] == ["understand", "route", "discover", "hours", "events", "signals", "feasibility", "stress"]
    assert all(s["status"] in ("done", "skipped") for s in job["stages"])
    assert any("opening" in (s["detail"] or "") or "schedules" in (s["detail"] or "") for s in job["stages"])
    j = client.get(f"/api/journey/{job['journey_id']}").json()
    assert j["data_mode"] == "demo" and len(j["waypoints"]) >= 3
    assert j["origin"]["name"] == "Delhi" and "SERPAPI" not in str(j)  # no secrets, ever


def test_stress_replan_slice_place_and_evidence_endpoints(client):
    job = discover(client)
    jid = job["journey_id"]
    j = client.get(f"/api/journey/{jid}").json()

    r = client.post("/api/journey/stress-test", json={"journey_id": jid, "scenario": "delay", "minutes": 45})
    assert r.status_code == 200 and r.json()["provenance"] == "simulated"

    r = client.get(f"/api/journey/{jid}/slice", params={"minute": 900})
    assert r.status_code == 200 and len(r.json()["nodes"]) >= 10

    wp = j["waypoints"][0]
    d = client.get(f"/api/place/{wp['id']}", params={"journey": jid}).json()
    assert d["in_route"] and len(d["fit_by_hour"]) > 10
    ev = client.get(f"/api/place/{wp['id']}/evidence", params={"journey": jid}).json()
    assert ev and all(e["source"] for e in ev)

    r = client.post("/api/journey/replan", json={"journey_id": jid, "mode": "scenic"})
    assert r.status_code == 200 and r.json()["journey"]["mode"] == "scenic"

    r = client.post("/api/journey/segment-discover", json={"journey_id": jid, "from_fraction": 0.3, "to_fraction": 0.6, "count": 5})
    assert r.status_code == 200
    for c in r.json()["candidates"]:
        assert c["temporal"] is not None and c["evidence"]


def test_errors_are_explicit(client):
    assert client.get("/api/journey/doesnotexist").status_code == 404
    assert client.get("/api/journey/doesnotexist/slice", params={"minute": 600}).status_code == 404
    r = client.post("/api/journey/stress-test", json={"journey_id": "nope", "scenario": "delay"})
    assert r.status_code == 404 and r.json()["detail"]["code"] == "not_found"


def test_live_mode_without_key_never_fabricates(client):
    r = client.post("/api/journey/discover", json={"origin": "Pune", "destination": "Goa", "date": "2026-10-03", "demo": False})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "serpapi_not_configured"
    r = client.post("/api/search/maps", json={"query": "cafe", "location": "Pune"})
    assert r.status_code == 503


def test_search_endpoints_in_demo_mode(client):
    r = client.post("/api/search/maps", json={"query": "heritage fort", "latitude": 27.99, "longitude": 76.38, "zoom": 12, "demo": True}).json()
    assert r["mode"] == "demo" and r["data"]["local_results"] and r["trace"][0]["engine"] == "google_maps"
    assert client.post("/api/search/events", json={"query": "events in Jaipur", "demo": True}).status_code == 200
    assert client.post("/api/search/news", json={"query": "Jaipur traffic", "demo": True}).status_code == 200
    assert client.post("/api/search/directions", json={"start": "Delhi", "end": "Jaipur", "demo": True}).json()["data"]["directions"]
    assert client.post("/api/search/hotels", json={"query": "hotels in Jaipur", "check_in_date": "2026-10-03", "check_out_date": "2026-10-04", "demo": True}).status_code == 200
    assert client.post("/api/search/flights", json={"departure_id": "DEL", "arrival_id": "JAI", "outbound_date": "2026-10-03", "demo": True}).status_code == 200
    assert client.post("/api/search/web", json={"query": "Amer Fort visiting hours", "demo": True}).status_code == 200


def test_analyze(client):
    r = client.post("/api/journey/analyze", json={"origin": "Delhi", "destination": "Jaipur", "date": "2026-10-03", "travel_styles": ["Food", "Photography"], "interests": ["Street Food"]})
    assert r.status_code == 200 and "food" in r.json()["styles"] and r.json()["engine"] == "rule-based"
