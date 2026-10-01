"""Live re-planning on top of a stored journey: no full regeneration, only the parts that actually change.

  start-time change   -> re-optimise over the SAME graph, diff against the old route ("YOUR ROUTE CHANGED")
  mode change         -> another objective function over the same graph
  replace / remove    -> validated replacement (or plain removal)
  add stop            -> forced insertion, rejected if it would break the plan
  apply recovery      -> deterministic stress-test recovery becomes the route ("ROUTE UPDATED")
  slice               -> the time slider: how every node fits if you arrive at minute m
  segment discovery   -> "Show me 5 interesting things along this segment" (fresh SerpApi searches)
"""
from __future__ import annotations

import asyncio
from typing import Any

from .. import trace
from ..config import get_settings
from ..llm import agents
from ..schemas import (
    ExperienceNode, PlaceDetail, PlanState, ReplanRequest, ReplanResponse, RouteChange, SegmentDiscoverRequest, SegmentDiscoverResponse,
    SliceNode, SliceResponse, StressRequest, StressResult,
)
from ..store import JourneyRecord, get_store
from . import ingest
from .geo import point_at_km
from .graph import DEST_ID, ORIGIN_ID, JourneyGraph, TravelModel, run_chain
from .optimizer import InfeasibleRoute, optimize
from .orchestrator import LATERAL_CAP_KM, RouteGeom, SearchOrchestrator, _dedupe, _prelim, _safe
from .repair import best_replacement, evaluate_slot
from .respond import build_response, decorate, reference_view
from .scoring import MODES
from .stress import apply_scenario, run_stress_test
from .temporal import assess, tone_for
from .timeutils import fmt_clock, parse_clock
from ..serpapi import tools


class NotFound(Exception):
    pass


class PlanError(Exception):
    def __init__(self, message: str, code: str = "infeasible"):
        super().__init__(message)
        self.message, self.code = message, code


def _record(journey_id: str) -> JourneyRecord:
    rec = get_store().get(journey_id)
    if not rec:
        raise NotFound(f"Journey {journey_id} not found")
    return rec


def _ctx_for(rec: JourneyRecord) -> trace.JourneyContext:
    return trace.JourneyContext(data_mode=rec.response.data_mode, max_calls=get_settings().max_calls_per_journey, journey_date=rec.graph.date)


def _diff(old_ids: list[str], new_ids: list[str], rec: JourneyRecord, graph: JourneyGraph, new_chain) -> tuple[list[dict], list[dict], list[dict]]:
    old_w = {w.id: w for w in rec.response.waypoints}
    removed = [{"id": i, "name": (old_w[i].name if i in old_w else graph.nodes[i].name), "role": graph.nodes[i].role} for i in old_ids if i not in new_ids]
    added = [{"id": i, "name": graph.nodes[i].name, "role": graph.nodes[i].role} for i in new_ids if i not in old_ids]
    retimed = []
    for st in new_chain.stops:
        if st.node.id in old_w and abs(st.arrival - old_w[st.node.id].arrival_min) >= 5:
            retimed.append({"id": st.node.id, "name": st.node.name, "from": old_w[st.node.id].arrival_min, "to": st.arrival})
    return removed, added, retimed


def _why_removed(rec: JourneyRecord, graph: JourneyGraph, state: PlanState, removed: list[dict]) -> dict[str, str]:
    """For each removed stop: the temporal reason it no longer fits in the (old) slot under the new state."""
    old_seq = rec.sequence
    chain = run_chain(graph, old_seq, state, TravelModel(graph))
    reasons: dict[str, str] = {}
    for st in chain.stops:
        reasons[st.node.id] = st.assessment.reason
    return {r["id"]: reasons.get(r["id"], "A better-fitting stop took its slot") for r in removed}


async def replan(req: ReplanRequest) -> ReplanResponse:
    rec = _record(req.journey_id)
    ctx = _ctx_for(rec)
    orch = SearchOrchestrator()
    with trace.journey_context(ctx):
        graph = rec.graph.model_copy(deep=True)
        state = rec.state.model_copy(deep=True)
        seq = list(rec.sequence)
        old_seq = list(seq)
        change: RouteChange | None = None
        tm = TravelModel(graph)

        if req.reset_disruptions:
            state = state.model_copy(update={"delay_min": 0, "event_shift_min": 0, "closed_ids": [], "overruns": {}, "excluded_ids": []})
            t = trace.StepTimer("repair", "Reset what-if disruptions", "engine")
            seq = optimize(graph, state, MODES[state.mode], previous=seq, tm=tm).sequence
            t.finish(results=len(seq))
            removed, added, retimed = _diff(old_seq, seq, rec, graph, run_chain(graph, seq, state, tm))
            change = RouteChange(kind="disruption", title="DISRUPTIONS CLEARED", message="Back to the original conditions.", removed=removed, added=added, retimed=retimed)

        if req.start_time:
            new_start = parse_clock(req.start_time, state.start_min)
            span = rec.state.end_by_min - rec.state.start_min
            state = state.model_copy(update={"start_min": new_start, "end_by_min": min(new_start + span, 26 * 60)})
            t = trace.StepTimer("optimize", "Re-optimise for new departure time", "engine")
            try:
                seq = optimize(graph, state, MODES[state.mode], previous=old_seq, tm=tm).sequence
            except InfeasibleRoute as exc:
                raise PlanError(str(exc)) from exc
            t.finish(results=len(seq))
            seq = await orch.refine_legs(graph, state, seq, ctx)
            ch = run_chain(graph, seq, state, TravelModel(graph))
            removed, added, retimed = _diff(old_seq, seq, rec, graph, ch)
            why = _why_removed(rec, graph, state, removed)
            for r in removed:
                r["reason"] = why.get(r["id"], "")
            if removed or added:
                msg = f"{len(removed)} experience{'s' if len(removed) != 1 else ''} no longer fit{'s' if len(removed) == 1 else ''} the new arrival window." if removed else "New experiences opened up at the new time."
            else:
                msg = f"All {len(seq)} stops still work — arrival times shifted by the new departure." if seq else "No stops needed."
            change = RouteChange(kind="start_time", title="YOUR ROUTE CHANGED", message=msg, removed=removed, added=added, retimed=retimed)

        if req.mode and req.mode != state.mode:
            state = state.model_copy(update={"mode": req.mode})
            t = trace.StepTimer("optimize", f"Optimise for {MODES[req.mode].label} mode", "engine")
            seq = optimize(graph, state, MODES[req.mode], tm=tm, previous=None).sequence
            t.finish(results=len(seq))
            seq = await orch.refine_legs(graph, state, seq, ctx)
            ch = run_chain(graph, seq, state, TravelModel(graph))
            removed, added, retimed = _diff(old_seq, seq, rec, graph, ch)
            change = RouteChange(
                kind="mode", title=f"{MODES[req.mode].label.upper()} ROUTE",
                message=f"Same Temporal Experience Graph, different objective: {len(seq)} stop{'s' if len(seq) != 1 else ''}, +{round(ch.detour_total)} min of detour.",
                removed=removed, added=added, retimed=retimed,
            )

        if req.replace_stop_id:
            if req.replace_stop_id not in seq:
                raise PlanError("That stop is not in the route.", "bad_request")
            idx = seq.index(req.replace_stop_id)
            cfg = MODES[state.mode]
            cands = best_replacement(graph, state, seq, idx, cfg, TravelModel(graph), base_travel=run_chain(graph, seq, state, tm).travel_minutes, limit=1)
            if not cands:
                raise PlanError("No nearby alternative validates at that point of your journey.", "no_alternative")
            ev = cands[0]
            old, new = graph.nodes[seq[idx]], graph.nodes[ev.node_id]
            seq[idx] = ev.node_id
            state = state.model_copy(update={"excluded_ids": [*state.excluded_ids, old.id]})
            seq = await orch.refine_legs(graph, state, seq, ctx)
            change = RouteChange(
                kind="replace", title="ROUTE UPDATED", message=f"{old.name} was replaced with {new.name}.",
                removed=[{"id": old.id, "name": old.name, "role": old.role}], added=[{"id": new.id, "name": new.name, "role": new.role}],
                why=f"{new.name} was checked against your actual arrival time ({fmt_clock(ev.arrival_min)}, {ev.status.replace('_', ' ').lower()}) "
                    f"and every later stop still fits; detour +{round(ev.detour_min)} min.",
            )

        if req.remove_stop_id:
            if req.remove_stop_id not in seq:
                raise PlanError("That stop is not in the route.", "bad_request")
            old = graph.nodes[req.remove_stop_id]
            seq = [i for i in seq if i != req.remove_stop_id]
            state = state.model_copy(update={"excluded_ids": [*state.excluded_ids, old.id], "forced_ids": [i for i in state.forced_ids if i != old.id]})
            ch = run_chain(graph, seq, state, TravelModel(graph), skip_invalid=True)
            seq = [s.node.id for s in ch.stops]
            change = RouteChange(kind="remove", title="STOP REMOVED", message=f"{old.name} removed — later stops re-timed.", removed=[{"id": old.id, "name": old.name, "role": old.role}])

        if req.add_place_id:
            if req.add_place_id not in graph.nodes:
                raise PlanError("Unknown place.", "bad_request")
            state = state.model_copy(update={"forced_ids": [*dict.fromkeys([*state.forced_ids, req.add_place_id])], "excluded_ids": [i for i in state.excluded_ids if i != req.add_place_id]})
            try:
                res = optimize(graph, state, MODES[state.mode], previous=seq, tm=tm)
            except InfeasibleRoute as exc:
                state = state.model_copy(update={"forced_ids": [i for i in state.forced_ids if i != req.add_place_id]})
                raise PlanError(f"{graph.nodes[req.add_place_id].name} can't be added without breaking the plan: {exc}", "infeasible") from exc
            seq = await orch.refine_legs(graph, state, res.sequence, ctx)
            ch = run_chain(graph, seq, state, TravelModel(graph))
            removed, added, retimed = _diff(old_seq, seq, rec, graph, ch)
            change = RouteChange(kind="add", title="STOP ADDED", message=f"{graph.nodes[req.add_place_id].name} added; every stop re-validated.", removed=removed, added=added, retimed=retimed)

        if req.apply_recovery:
            sreq = req.apply_recovery.model_copy(update={"journey_id": req.journey_id})
            result = run_stress_test(graph, state, seq, sreq, MODES[state.mode])
            if not result.applicable:
                raise PlanError(result.note or "Scenario not applicable", "not_applicable")
            st2, _, _, _, _ = apply_scenario(graph, state, seq, sreq)
            if result.recovery:
                new_seq = result.recovery.new_sequence
                excluded = [*st2.excluded_ids, *[o.removed_id for o in result.recovery.ops]]
                state = st2.model_copy(update={"excluded_ids": list(dict.fromkeys(excluded))})
                seq = new_seq
                explanation, _ = await agents.explain_recovery(_recovery_facts(result), result.recovery.narrative)
                removed = [{"id": o.removed_id, "name": o.removed_name, "role": graph.nodes[o.removed_id].role, "reason": o.reason} for o in result.recovery.ops]
                added = [{"id": o.added.id, "name": o.added.name, "role": o.added.role} for o in result.recovery.ops if o.added]
                change = RouteChange(
                    kind="recovery", title="ROUTE UPDATED", message=" ".join(
                        f"{o.removed_name} was removed because {o.reason[0].lower() + o.reason[1:]}." + (f" Replaced with {o.added.name}." if o.added else " No validated alternative — dropped.")
                        for o in result.recovery.ops
                    ), removed=removed, added=added, why=explanation,
                )
            else:
                state = st2
                change = RouteChange(kind="disruption", title="DISRUPTION APPLIED", message=result.explanation)

        if change is None:
            change = RouteChange(kind="mode", title="NO CHANGE", message="Nothing to change.")

        new_rec = await _finish(rec, graph, state, seq, ctx, change)
        return ReplanResponse(journey=new_rec.response, change=change)


def _recovery_facts(result: StressResult) -> dict[str, Any]:
    rec = result.recovery
    return {
        "scenario": result.label,
        "provenance": "simulated",
        "changes": [
            {"removed": o.removed_name, "reason": o.reason, "replacement": o.added.name if o.added else None, "arrival": fmt_clock(o.arrival_min) if o.arrival_min is not None else None,
             "status": o.status, "detour_min": o.detour_min} for o in (rec.ops if rec else [])
        ],
        "extra_travel_minutes": rec.extra_travel_minutes if rec else 0,
        "experiences_preserved": rec.experiences_preserved if rec else 0,
        "experiences_total": rec.experiences_total if rec else 0,
    }


async def _finish(rec: JourneyRecord, graph: JourneyGraph, state: PlanState, seq: list[str], ctx: trace.JourneyContext, change: RouteChange) -> JourneyRecord:
    resp = await build_response(
        journey_id=rec.id, version=rec.response.version + 1, created_at=rec.response.created_at, data_mode=rec.response.data_mode, request=rec.response.request,
        graph=graph, state=state, seq=seq, trace_steps=[*rec.response.trace, *ctx.steps], warnings=[*rec.response.warnings, *[w for w in ctx.warnings if w not in rec.response.warnings]],
        signals=rec.response.signals, evidence=rec.response.evidence, stay=rec.response.stay, flights=rec.response.flights, change=change,
        original_ids=rec.response.original_waypoint_ids, with_options=True,
    )
    new_rec = JourneyRecord(id=rec.id, response=resp, graph=graph, state=state, sequence=seq)
    get_store().put(new_rec)
    return new_rec


# ------------------------------------------------------------------------------------------------ stress
async def stress(req: StressRequest) -> StressResult:
    rec = _record(req.journey_id)
    ctx = _ctx_for(rec)
    with trace.journey_context(ctx):
        t = trace.StepTimer("stress", f"Simulate: {req.scenario}", "engine")
        result = run_stress_test(rec.graph, rec.state, rec.sequence, req, MODES[rec.state.mode])
        t.finish(results=len(result.stops), detail=f"{result.broken} broken · {result.at_risk} at risk · outcome {result.outcome}")
        if result.applicable:
            facts = {
                "scenario": result.label, "provenance": "simulated", "verdict": result.verdict,
                "stops": [{"name": s.name, "before": fmt_clock(s.before_arrival_min), "after": fmt_clock(s.after_arrival_min) if s.after_arrival_min is not None else None,
                           "status": s.after_status, "reason": s.after_reason} for s in result.stops],
                "extra_travel_minutes": result.recovery.extra_travel_minutes if result.recovery else 0,
                "experiences_preserved": result.recovery.experiences_preserved if result.recovery else len(result.stops),
                "experiences_total": len(result.stops),
                "replacements": [{"removed": o.removed_name, "added": o.added.name if o.added else None} for o in (result.recovery.ops if result.recovery else [])],
            }
            result.explanation, result.explanation_engine = await agents.explain_stress(facts, result.explanation)  # type: ignore[assignment]
            if result.recovery:
                result.recovery.narrative, result.recovery.narrative_engine = await agents.explain_recovery(_recovery_facts(result), result.recovery.narrative)  # type: ignore[assignment]
        # persist the simulation steps in the trace so the drawer shows them
        rec.response.trace.extend(ctx.steps)
        get_store().put(rec)
        return result


# ------------------------------------------------------------------------------------------------ time slider
def slice_at(journey_id: str, minute: int) -> SliceResponse:
    rec = _record(journey_id)
    graph, state = rec.graph, rec.state
    tctx = graph.time_ctx(state)
    seq = set(rec.sequence)
    nodes: list[SliceNode] = []
    for n in graph.nodes.values():
        a = assess(n, minute, tctx)
        nodes.append(SliceNode(id=n.id, name=n.name, fit=a.score, status=a.status, tone=tone_for(a), in_route=n.id in seq, reason=a.reason, role=n.role))
    nodes.sort(key=lambda x: -x.fit)
    good = [n for n in nodes if n.tone in ("green", "yellow") and n.fit >= 0.55]
    bad_in_route = [n.name for n in nodes if n.in_route and n.tone == "red"]
    roles = sorted({n.role.replace("_", " ") for n in good})
    summary = f"If you arrive around {fmt_clock(minute)}: {len(good)} of {len(nodes)} experiences work" + (f" — {', '.join(roles[:5])}." if roles else ".")
    return SliceResponse(minute=minute, nodes=nodes, relevant_now=[n.name for n in good[:8]], unavailable_now=bad_in_route, summary=summary)


# ------------------------------------------------------------------------------------------------ segment discovery
async def segment_discover(req: SegmentDiscoverRequest) -> SegmentDiscoverResponse:
    rec = _record(req.journey_id)
    ctx = _ctx_for(rec)
    f0, f1 = sorted((max(0.0, min(1.0, req.from_fraction)), max(0.0, min(1.0, req.to_fraction))))
    if f1 - f0 < 0.04:
        f1 = min(1.0, f0 + 0.1)
    with trace.journey_context(ctx):
        graph = rec.graph.model_copy(deep=True)
        route = graph.route
        geom = RouteGeom([tuple(p) for p in route.polyline], route.distance_km)
        profile = graph.profile
        qs = agents.baseline_queries(profile.styles, profile.interests, {"lunch": False, "dinner": False}) or ["tourist attraction"]
        mid = (f0 + f1) / 2
        anchor_pts = [point_at_km(geom.poly, geom.cum, f * geom.distance_km) for f in (f0 + (f1 - f0) * 0.25, f0 + (f1 - f0) * 0.75)] if f1 - f0 > 0.2 else [point_at_km(geom.poly, geom.cum, mid * geom.distance_km)]
        queries = list(dict.fromkeys([*qs[:4], "food", "viewpoint"]))[:5]
        jobs = []
        for i, (lat, lon) in enumerate(anchor_pts):
            for q in queries[i::len(anchor_pts)][:3]:
                jobs.append(_safe(tools.search_maps(q, latitude=lat, longitude=lon, zoom=12, phase="maps"), ctx, f"Segment search '{q}'"))
        results = await asyncio.gather(*jobs)
        raw: list[ExperienceNode] = []
        for data in results:
            for r in (data or {}).get("local_results") or []:
                n = ingest.node_from_local_result(r, rec.response.data_mode)
                if n:
                    raw.append(n)
        fresh = [n for n in _dedupe(raw) if n.id not in graph.nodes]
        for n in fresh:
            geom.place(n)
        fresh = [n for n in fresh if n.lateral_km <= 18 and f0 - 0.04 <= n.progress <= f1 + 0.04]
        fresh.sort(key=lambda n: -_prelim(n, profile))
        fresh = fresh[:8]
        orch = SearchOrchestrator()
        await orch._details(fresh, ctx, rec.response.data_mode)
        for n in fresh:
            graph.nodes[n.id] = n
        if not fresh:
            return SegmentDiscoverResponse(from_fraction=f0, to_fraction=f1, candidates=[], note="Nothing new found along this segment.")
        state, seq = rec.state, rec.sequence
        tm = TravelModel(graph)
        cfg = MODES[state.mode]
        base = run_chain(graph, seq, state, tm)
        out: list[tuple[bool, float, ExperienceNode]] = []
        for n in fresh:
            idx = sum(1 for sid in seq if graph.nodes[sid].progress_km <= n.progress_km)
            ev = evaluate_slot(graph, state, seq, idx, n.id, cfg, tm, replace=False, base_travel=base.travel_minutes)
            if ev.chain is not None:
                new_seq = [*seq[:idx], n.id, *seq[idx:]]
                st = ev.chain.stops[new_seq.index(n.id)]
                view = decorate(graph, n, st.assessment, st.detour_min, st.detour_km, cfg)
            else:
                view = reference_view(graph, n, state, cfg, tm)
            out.append((ev.ok, ev.score, view))
        out.sort(key=lambda x: (not x[0], -x[1]))
        cands = [v for _, _, v in out][: max(1, min(8, req.count))]
        # persist the enlarged graph so "Add to route" can reference these nodes
        rec2 = JourneyRecord(id=rec.id, response=rec.response, graph=graph, state=rec.state, sequence=rec.sequence)
        get_store().put(rec2)
        fits = sum(1 for ok, _, _ in out[: len(cands)] if ok)
        return SegmentDiscoverResponse(
            from_fraction=f0, to_fraction=f1, candidates=cands,
            note=f"{fits} of {len(cands)} fit your current timing without breaking later stops." if cands else None,
        )


# ------------------------------------------------------------------------------------------------ place detail
def place_detail(place_id: str, journey_id: str | None) -> PlaceDetail:
    found = get_store().find_place(place_id, journey_id)
    if not found:
        raise NotFound("Place not found")
    node, rec = found
    resp = rec.response
    view = next((w for w in resp.waypoints if w.id == place_id), None) or next((a for a in resp.alternatives if a.id == place_id), None) \
        or next((p for p in resp.pool if p.id == place_id), None)
    if view is None:
        tm = TravelModel(rec.graph)
        view = reference_view(rec.graph, node, rec.state, MODES[rec.state.mode], tm)
    tctx = rec.graph.time_ctx(rec.state)
    curve = []
    for m in range(6 * 60, 23 * 60 + 1, 30):
        a = assess(node, m, tctx)
        curve.append({"minute": m, "fit": round(a.score * 100), "status": a.status, "valid": a.valid})
    return PlaceDetail(node=view, journey_id=rec.id, in_route=place_id in rec.sequence, fit_by_hour=curve)
