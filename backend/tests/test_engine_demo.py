"""End-to-end tests of the discovery -> stress -> recovery pipeline on the deterministic demo snapshot."""
import pytest

from app.engine.parsing import intervals_for_date
from app.engine.replan import PlanError, replan, slice_at, stress
from app.engine.timeutils import resolve_date
from app.schemas import ReplanRequest, StressRequest
from app.store import get_store


async def test_journey_is_complete_and_honest(demo_journey):
    j = demo_journey
    assert j.data_mode == "demo" and j.route.distance_km > 200 and len(j.waypoints) >= 3
    assert [c.name for c in j.route.corridor][:2] == ["Gurugram", "Manesar"]  # corridor towns verified through Maps
    assert len({w.id for w in j.waypoints}) == len(j.waypoints)  # no duplicates
    assert len(j.route_options) == 5 and sum(1 for o in j.route_options if o.selected) == 1
    engines = {t.engine for t in j.trace if t.kind == "serpapi"}
    assert {"google_maps", "google_maps_directions", "google_maps_reviews", "google_events", "google_news", "google"} <= engines
    assert any(t.kind == "llm" for t in j.trace)  # reasoning steps are in the trace too (rule-based without a Groq key)
    assert 0 < j.robustness.score <= 99


async def test_every_stop_is_valid_when_you_get_there(demo_journey):
    j = demo_journey
    d = resolve_date(j.request.date)
    prev_depart = j.state.start_min
    for w in j.waypoints:
        assert w.temporal and w.temporal.valid and w.temporal.score >= 0.6, w.name
        assert w.arrival_min >= prev_depart + 1  # time only moves forward; travel time is respected
        assert w.depart_min == w.start_min + w.estimated_visit_minutes
        if w.hours_known and w.kind == "place":  # opening hours respected for the whole visit
            ivs = intervals_for_date(w.opening_hours, d)
            assert any(o <= w.start_min and w.depart_min <= c + 1 for o, c in ivs), (w.name, w.start_min, w.depart_min, ivs)
        assert w.route_detour_minutes >= 0 and w.scores.total > 0 and w.evidence and w.reasons
        prev_depart = w.depart_min
    assert j.arrive_min <= j.state.end_by_min + 1


async def test_observed_vs_inferred_provenance(demo_journey):
    for w in demo_journey.waypoints:
        assert any(e.provenance == "observed" and e.source.startswith("google") for e in w.evidence)
        assert w.temporal.provenance == "inferred"  # the verdict is an inference over observed hours


async def test_delay_stress_test_recovers_with_validated_replacement(demo_journey):
    res = await stress(StressRequest(journey_id=demo_journey.journey_id, scenario="delay", minutes=45))
    assert res.provenance == "simulated" and len(res.stops) == len(demo_journey.waypoints)
    if res.verdict == "BREAK_DETECTED":
        rec = res.recovery
        assert rec and rec.ops
        assert all(w.temporal and w.temporal.valid for w in rec.new_waypoints)  # replacements are validated, not asked of an LLM
        for op in rec.ops:
            if op.type == "replace":
                assert op.added and op.added.id != op.removed_id and op.status
        assert rec.experiences_preserved >= 1 and rec.arrive_after_min <= demo_journey.state.end_by_min + 60
    else:
        assert res.broken == 0


async def test_closed_stop_is_replaced(demo_journey):
    target = demo_journey.waypoints[1]
    res = await stress(StressRequest(journey_id=demo_journey.journey_id, scenario="stop_closed", stop_id=target.id))
    assert res.verdict == "BREAK_DETECTED"
    broken = next(s for s in res.stops if s.stop_id == target.id)
    assert broken.after_tone == "red"
    assert target.id not in res.recovery.new_sequence
    assert all(w.temporal.valid for w in res.recovery.new_waypoints)


async def test_apply_recovery_updates_the_route(demo_journey):
    out = await replan(ReplanRequest(journey_id=demo_journey.journey_id, apply_recovery=StressRequest(journey_id=demo_journey.journey_id, scenario="delay", minutes=60)))
    j = out.journey
    assert j.version == 2 and j.state.delay_min == 60 and out.change.title in ("ROUTE UPDATED", "DISRUPTION APPLIED")
    assert all(w.temporal.valid for w in j.waypoints)
    assert j.original_waypoint_ids == demo_journey.original_waypoint_ids  # original plan is kept for comparison
    again = get_store().get(j.journey_id)
    assert again and again.response.version == 2  # persisted


async def test_changing_departure_diffs_the_route(demo_journey):
    out = await replan(ReplanRequest(journey_id=demo_journey.journey_id, start_time="11:00"))
    assert out.change.kind == "start_time" and out.change.title == "YOUR ROUTE CHANGED"
    assert all(w.temporal.valid for w in out.journey.waypoints)
    assert out.journey.state.start_min == 660
    assert {r["id"] for r in out.change.removed}.isdisjoint({w.id for w in out.journey.waypoints})


async def test_modes_are_different_objectives_over_the_same_graph(demo_journey):
    fast = await replan(ReplanRequest(journey_id=demo_journey.journey_id, mode="fastest"))
    assert len(fast.journey.waypoints) <= 2
    disc = await replan(ReplanRequest(journey_id=demo_journey.journey_id, mode="discovery"))
    assert disc.journey.mode == "discovery" and disc.journey.total_detour_minutes >= fast.journey.total_detour_minutes


async def test_replace_stop_uses_a_validated_fallback(demo_journey):
    w = next((w for w in demo_journey.waypoints if w.fallback_options), None)
    if w is None:
        pytest.skip("no fallbacks in this plan")
    out = await replan(ReplanRequest(journey_id=demo_journey.journey_id, replace_stop_id=w.id))
    assert w.id not in {x.id for x in out.journey.waypoints}
    assert all(x.temporal.valid for x in out.journey.waypoints)


async def test_time_slider_slice(demo_journey):
    morning = slice_at(demo_journey.journey_id, 10 * 60)
    evening = slice_at(demo_journey.journey_id, 19 * 60 + 45)
    by_name_m = {n.name: n for n in morning.nodes}
    by_name_e = {n.name: n for n in evening.nodes}
    folk = "Rajasthani Folk Music & Ghoomar Evening"
    assert by_name_e[folk].tone in ("green", "yellow") and by_name_m[folk].tone == "red"  # the same place has different value at different times
    assert by_name_m["Pink City Sunrise Heritage Walk"].tone == "red"
    assert "experiences work" in morning.summary


async def test_impossible_stop_is_rejected_or_valid(demo_journey):
    pool = get_store().get(demo_journey.journey_id).graph.nodes
    chokhi = next(n for n in pool.values() if "Chokhi" in n.name)
    try:
        out = await replan(ReplanRequest(journey_id=demo_journey.journey_id, add_place_id=chokhi.id))
    except PlanError:
        return  # rejected because it would break the plan: correct behaviour
    assert all(w.temporal.valid for w in out.journey.waypoints)
