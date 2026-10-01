"""Assemble the JourneyResponse from (graph, plan state, sequence)."""
from __future__ import annotations

from typing import Any

from ..llm.agents import trip_narrator
from ..schemas import (
    CurrentSignal, Evidence, ExperienceNode, FlightOption, JourneyRequest, JourneyResponse, Narrative, PlanState, RouteChange,
    RouteOption, ROUTE_MODES, StaySuggestion, TraceStep,
)
from .assemble import make_timeline, make_waypoints
from .geo import downsample
from .graph import DEST_ID, ORIGIN_ID, JourneyGraph, TravelModel, run_chain
from .optimizer import InfeasibleRoute, optimize
from .repair import best_replacement
from .scoring import (
    MODES, ModeConfig, build_reasons, build_risks, detour_cost_inr, preference_fit, score_node,
)
from .stress import compute_robustness
from .temporal import assess, tone_for
from .timeutils import fmt_clock, fmt_duration


def decorate(graph: JourneyGraph, node: ExperienceNode, a, detour_min: float, detour_km: float, cfg: ModeConfig) -> ExperienceNode:
    """Copy of a graph node carrying journey-specific numbers (temporal assessment, scores, reasons, risks)."""
    _, matched = preference_fit(node, graph.profile)
    data = node.model_dump()
    data.update(
        temporal=a,
        scores=score_node(node, a, detour_min, graph.profile, cfg),
        matched_interests=matched,
        route_detour_minutes=round(detour_min, 1),
        route_detour_km=round(detour_km, 1),
        detour_cost_inr=detour_cost_inr(detour_km),
        reasons=[r.model_dump() for r in build_reasons(node, a, detour_min, detour_km, matched)],
        failure_risks=[r.model_dump() for r in build_risks(node, a, detour_min)],
    )
    return ExperienceNode(**data)


def reference_view(graph: JourneyGraph, node: ExperienceNode, state: PlanState, cfg: ModeConfig, tm: TravelModel) -> ExperienceNode:
    """A node as seen on the *direct* route (no other stops): used for pool / map context."""
    arrival = int(round(state.start_min + state.delay_min + tm.minutes(ORIGIN_ID, node.id)))
    a = assess(node, arrival, graph.time_ctx(state))
    detour = max(0.0, tm.minutes(ORIGIN_ID, node.id) + tm.minutes(node.id, DEST_ID) - tm.minutes(ORIGIN_ID, DEST_ID))
    detour_km = max(0.0, tm.leg(ORIGIN_ID, node.id)[1] + tm.leg(node.id, DEST_ID)[1] - tm.leg(ORIGIN_ID, DEST_ID)[1])
    return decorate(graph, node, a, detour, detour_km, cfg)


def option_for(graph: JourneyGraph, state: PlanState, mode: str, seq: list[str], tm: TravelModel, selected: bool) -> RouteOption:
    cfg = MODES[mode]
    st = state.model_copy(update={"mode": mode})
    chain = run_chain(graph, seq, st, tm)
    rob = compute_robustness(graph, st, seq, cfg, tm)
    return RouteOption(
        mode=mode, label=cfg.label, tagline=cfg.tagline,  # type: ignore[arg-type]
        travel_minutes=chain.travel_minutes, stops=len(chain.stops), total_minutes=chain.arrive_min - state.start_min - state.delay_min,
        detour_minutes=int(round(chain.detour_total)), arrive_min=chain.arrive_min, robustness=rob.score,
        stop_names=[s.node.name for s in chain.stops], selected=selected,
    )


def compute_options(graph: JourneyGraph, state: PlanState, current_seq: list[str], tm: TravelModel) -> list[RouteOption]:
    """Every mode over the same graph. Modes other than the selected one use the geometric travel model only
    (observed directions are fetched for the route you actually pick)."""
    est = TravelModel(graph, use_observed=False)
    out: list[RouteOption] = []
    for m in ROUTE_MODES:
        if m == state.mode:
            out.append(option_for(graph, state, m, current_seq, tm, True))
            continue
        try:
            seq = optimize(graph, state.model_copy(update={"mode": m, "forced_ids": []}), MODES[m], tm=est).sequence
        except InfeasibleRoute:
            seq = []
        out.append(option_for(graph, state, m, seq, est, False))
    return out


async def narrate(graph: JourneyGraph, state: PlanState, waypoints, chain, origin: str, dest: str) -> Narrative:
    facts: dict[str, Any] = {
        "origin": origin.split(",")[0], "destination": dest.split(",")[0], "start": fmt_clock(state.start_min + state.delay_min),
        "arrive": fmt_clock(chain.arrive_min), "direct": fmt_duration(graph.route.duration_min), "detour": int(round(chain.detour_total)),
        "mode": state.mode,
        "stops": [
            {
                "name": w.name, "role": w.role, "arrival": fmt_clock(w.arrival_min), "leave": fmt_clock(w.depart_min), "detour_min": round(w.route_detour_minutes),
                "rating": w.rating, "status": w.temporal.status if w.temporal else None,
                "top_reason": (w.one_liner or (w.reasons[1].text if len(w.reasons) > 1 else w.reasons[0].text if w.reasons else "fits your journey")),
            }
            for w in waypoints
        ],
    }
    return await trip_narrator(facts)


async def build_response(
    *,
    journey_id: str,
    version: int,
    created_at: str,
    data_mode: str,
    request: JourneyRequest,
    graph: JourneyGraph,
    state: PlanState,
    seq: list[str],
    trace_steps: list[TraceStep],
    warnings: list[str],
    signals: list[CurrentSignal],
    evidence: list[Evidence],
    stay: list[StaySuggestion],
    flights: list[FlightOption],
    change: RouteChange | None = None,
    original_ids: list[str] | None = None,
    with_options: bool = True,
) -> JourneyResponse:
    cfg = MODES[state.mode]
    tm = TravelModel(graph)
    chain = run_chain(graph, seq, state, tm)
    waypoints = make_waypoints(graph, chain, cfg)

    # validated fallbacks for every stop (each candidate re-checked at the stop's actual arrival time)
    alternatives: dict[str, ExperienceNode] = {}
    base_travel = chain.travel_minutes
    for i, w in enumerate(waypoints):
        evs = best_replacement(graph, state, seq, i, cfg, tm, base_travel=base_travel, limit=3)
        w.fallback_options = [e.node_id for e in evs]
        for e in evs:
            if e.node_id in alternatives or e.chain is None:
                continue
            pos = [s.node.id for s in e.chain.stops].index(e.node_id)
            st = e.chain.stops[pos]
            alt = decorate(graph, graph.nodes[e.node_id], st.assessment, st.detour_min, st.detour_km, cfg)
            alternatives[e.node_id] = alt

    pool = [
        reference_view(graph, n, state, cfg, tm)
        for n in graph.nodes.values()
        if n.id not in seq and n.id not in alternatives
    ]
    timeline = make_timeline(graph, chain, state, waypoints)
    robustness = compute_robustness(graph, state, seq, cfg, tm)
    options = compute_options(graph, state, seq, tm) if with_options else []
    narrative = await narrate(graph, state, waypoints, chain, graph.origin.name, graph.destination.name)

    return JourneyResponse(
        journey_id=journey_id, version=version, created_at=created_at, data_mode=data_mode,  # type: ignore[arg-type]
        request=request, mode=state.mode, state=state, origin=graph.origin, destination=graph.destination,
        route=graph.route.model_copy(update={"polyline": [list(p) for p in downsample([tuple(p) for p in graph.route.polyline], 400)]}),
        waypoints=waypoints, timeline=timeline, evidence=evidence, signals=signals, robustness=robustness,
        alternatives=list(alternatives.values()), pool=pool, route_options=options, narrative=narrative, sunset_min=graph.sunset_min,
        stay=stay, flights=flights, warnings=warnings, change=change, original_waypoint_ids=original_ids or [w.id for w in waypoints],
        trace=trace_steps, total_travel_minutes=chain.travel_minutes, total_detour_minutes=int(round(chain.detour_total)),
        arrive_min=chain.arrive_min, direct_minutes=int(round(tm.minutes(ORIGIN_ID, DEST_ID))),
    )
