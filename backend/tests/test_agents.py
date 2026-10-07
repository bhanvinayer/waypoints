"""The LLM never supplies facts: its output is validated, grounded or discarded."""
import json

import httpx

from app.config import Settings
from app.llm import agents
from app.llm.groq_client import GroqClient, set_groq


def groq_returning(payload: dict):
    def handler(request: httpx.Request):
        assert request.headers["authorization"].startswith("Bearer ")
        body = json.loads(request.content)
        assert body["response_format"] == {"type": "json_object"} and body["temperature"] == 0.0
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(payload)}}]})

    client = GroqClient(settings=Settings(groq_api_key="gk_test", groq_model="openai/gpt-oss-20b"), transport=httpx.MockTransport(handler))
    set_groq(client)
    return client


FACTS = {
    "origin": "Delhi", "destination": "Jaipur", "start": "8:00 AM", "arrive": "6:27 PM", "direct": "4h 40m", "detour": 46, "mode": "experience",
    "stops": [{"name": "Neemrana Fort-Palace", "role": "heritage", "arrival": "10:41 AM", "leave": "11:41 AM", "detour_min": 9, "rating": 4.5, "status": "IDEAL_WINDOW", "top_reason": "Open at arrival"}],
}


async def test_narrator_accepts_grounded_text():
    groq_returning({"headline": "A fort worth the short detour", "summary": "Leave Delhi at 8:00 AM and stop at Neemrana Fort-Palace around 10:41 AM, arriving by 6:27 PM.", "highlights": ["10:41 AM · Neemrana Fort-Palace stays open for your visit"]})
    n = await agents.trip_narrator(FACTS)
    assert n.engine == "groq" and "Neemrana" in n.summary


async def test_narrator_rejects_invented_numbers():
    groq_returning({"headline": "Great day", "summary": "Stop at Neemrana Fort-Palace at 11:15 AM then arrive at 7:45 PM.", "highlights": ["Neemrana Fort-Palace at 11:15 AM"]})
    n = await agents.trip_narrator(FACTS)
    assert n.engine == "rule-based"  # 11:15 / 7:45 are not in the evidence -> discarded


async def test_curator_clamps_and_validates_ids():
    groq_returning({"items": [
        {"id": "p_1", "pref_adjust": 5, "role": "museum", "one_liner": "Visitors love the carved courtyards"},
        {"id": "ghost", "pref_adjust": 0.1, "role": "meal", "one_liner": "invented place"},
        {"id": "p_2", "pref_adjust": -0.05, "role": "not-a-role", "one_liner": "Open until 9 PM with 4.9 stars"},
    ]})
    res = await agents.experience_curator([{"id": "p_1", "name": "A"}, {"id": "p_2", "name": "B"}], ["culture"], [], None)
    assert res.pref_adjust == {"p_1": 0.1, "p_2": -0.05}  # clamped to +/-0.1, unknown id ignored
    assert res.roles == {"p_1": "museum"} and "p_1" in res.one_liners
    assert "p_2" not in res.one_liners  # digits (invented facts) are rejected


async def test_news_triage_only_uses_given_indexes():
    groq_returning({"items": [{"i": 0, "relevant": True, "kind": "traffic", "severity": "watch", "affects": "Amer Road", "note": "Diversion on Amer Road"},
                              {"i": 9, "relevant": True, "kind": "closure", "severity": "warn", "affects": "Nowhere", "note": "invented"}]})
    items = [{"i": 0, "title": "Weekend traffic diversion on Amer Road", "snippet": "", "publisher": "X", "date": "1 day ago"}]
    triage, engine = await agents.triage_news(items, ["amer"], {})
    assert engine == "groq" and [t.index for t in triage] == [0] and triage[0].severity == "watch"


async def test_everything_falls_back_without_a_key():
    set_groq(GroqClient(settings=Settings(groq_api_key="")))
    n = await agents.trip_narrator(FACTS)
    assert n.engine == "rule-based" and "Neemrana Fort-Palace" in n.headline + n.summary + " ".join(n.highlights)
    triage, engine = await agents.triage_news([{"i": 0, "title": "NH48 lane closure near Behror", "snippet": "slow traffic", "publisher": None, "date": None}], ["behror"], {})
    assert engine == "rule-based" and triage[0].severity == "watch"  # a lane closure is a watch item, not a warning


async def test_groq_failure_is_graceful():
    def handler(request):
        return httpx.Response(500, json={"error": "boom"})

    set_groq(GroqClient(settings=Settings(groq_api_key="gk_test"), transport=httpx.MockTransport(handler)))
    out = await agents.explain_stress({"scenario": "45 min delay"}, "fallback text")
    assert out == ("fallback text", "rule-based")
