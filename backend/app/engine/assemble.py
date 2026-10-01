"""Turn chain results into the response objects (Waypoint cards + timeline)."""
from __future__ import annotations

from ..schemas import ExperienceNode, PlanState, TimelineItem, Waypoint
from .graph import ChainResult, JourneyGraph
from .scoring import ModeConfig, build_reasons, build_risks, detour_cost_inr, preference_fit, score_node
from .temporal import tone_for
from .timeutils import fmt_duration


def make_waypoints(graph: JourneyGraph, chain: ChainResult, cfg: ModeConfig) -> list[Waypoint]:
    out: list[Waypoint] = []
    for i, st in enumerate(chain.stops):
        n = st.node
        a = st.assessment
        _, matched = preference_fit(n, graph.profile)
        scores = score_node(n, a, st.detour_min, graph.profile, cfg)
        data = n.model_dump()
        data.update(
            temporal=a,
            scores=scores,
            matched_interests=matched,
            route_detour_minutes=round(st.detour_min, 1),
            route_detour_km=round(st.detour_km, 1),
            detour_cost_inr=detour_cost_inr(st.detour_km),
            travel_from_previous_minutes=round(st.leg_min, 1),
            travel_source=st.leg_src,
            reasons=[r.model_dump() for r in build_reasons(n, a, st.detour_min, st.detour_km, matched)],
            failure_risks=[r.model_dump() for r in build_risks(n, a, st.detour_min)],
        )
        out.append(
            Waypoint(
                **data,
                order=i + 1,
                arrival_min=st.arrival,
                start_min=st.start,
                depart_min=st.depart,
                wait_min=st.wait,
                tone=tone_for(a),
                slack_min=a.slack_min,
            )
        )
    return out


def make_timeline(graph: JourneyGraph, chain: ChainResult, state: PlanState, waypoints: list[Waypoint]) -> list[TimelineItem]:
    items: list[TimelineItem] = []
    origin, dest = graph.origin.name.split(",")[0], graph.destination.name.split(",")[0]
    items.append(TimelineItem(id="start", kind="start", start_min=state.start_min, end_min=state.start_min, title=f"Depart {origin}", subtitle="Your journey begins"))
    t = state.start_min
    if state.delay_min:
        items.append(TimelineItem(
            id="delay", kind="delay", start_min=t, end_min=t + state.delay_min, title=f"Delayed +{state.delay_min} min",
            subtitle="What-if applied to this route", tone="yellow", provenance="simulated",
        ))
        t += state.delay_min
    prev_name = origin
    for wp in waypoints:
        drive = wp.arrival_min - t
        if drive > 0:
            items.append(TimelineItem(
                id=f"drive-{wp.order}", kind="drive", start_min=t, end_min=wp.arrival_min,
                title=f"Drive {fmt_duration(drive)}", subtitle=f"{prev_name} → {wp.name}", provenance=wp.travel_source,
            ))
        sub = f"+{round(wp.route_detour_minutes)} min detour · {wp.estimated_visit_minutes} min visit"
        if wp.wait_min:
            sub += f" · wait {wp.wait_min} min"
        items.append(TimelineItem(
            id=f"stop-{wp.order}", kind="stop", start_min=wp.arrival_min, end_min=wp.depart_min, title=wp.name, subtitle=sub,
            node_id=wp.id, detour_min=wp.route_detour_minutes, tone=wp.tone,
        ))
        t = wp.depart_min
        prev_name = wp.name
    if chain.arrive_min - t > 0:
        items.append(TimelineItem(
            id="drive-final", kind="drive", start_min=t, end_min=chain.arrive_min,
            title=f"Drive {fmt_duration(chain.arrive_min - t)}", subtitle=f"{prev_name} → {dest}",
        ))
    items.append(TimelineItem(id="end", kind="end", start_min=chain.arrive_min, end_min=chain.arrive_min, title=f"Arrive {dest}", subtitle="Journey complete"))
    return items


def node_summary(n: ExperienceNode) -> dict:
    return {"id": n.id, "name": n.name, "role": n.role}
