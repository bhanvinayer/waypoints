"""Route optimiser: one objective function per route mode, all over the SAME Temporal Experience Graph.

Beam search over candidates ordered along the route. A stop is only admitted if, at the arrival time implied by
everything chosen so far, it is temporally valid (open, window not missed) and the traveller still reaches the
destination before the end-of-day limit within the mode's detour budget. Impossible itineraries are never produced.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..schemas import ExperienceNode, PlanState
from .geo import haversine_km
from .graph import DEST_ID, ORIGIN_ID, ChainResult, JourneyGraph, TravelModel, run_chain
from .scoring import ModeConfig, day_slot, preference_fit, score_node, stop_utility
from .temporal import assess, best_arrival_range, in_ideal_window

DEST_AREA_KM = 15.0
STICKINESS = 6.0
MIN_TEMPORAL = 0.6


class InfeasibleRoute(Exception):
    pass


@dataclass
class OptResult:
    sequence: list[str]
    chain: ChainResult
    value: float


@dataclass(order=False)
class _State:
    seq: tuple[str, ...] = ()
    t: float = 0.0
    last: str = ORIGIN_ID
    detour: float = 0.0
    value: float = 0.0
    roles: dict[str, int] = field(default_factory=dict)
    last_meal_start: int | None = None
    last_progress: float = -1.0
    progresses: tuple[float, ...] = ()
    slots: frozenset = frozenset()


def candidate_pool(graph: JourneyGraph, state: PlanState, cfg: ModeConfig, tm: TravelModel | None = None) -> list[ExperienceNode]:
    """Geographic + broad temporal filtering (before any exact, chain-dependent validation)."""
    tm = tm or TravelModel(graph)
    ctx = graph.time_ctx(state)
    out: list[ExperienceNode] = []
    start = state.start_min + state.delay_min
    for n in graph.nodes.values():
        if n.id in state.excluded_ids or n.id in state.closed_ids:
            continue
        if n.lateral_km > cfg.max_lateral_km and n.id not in state.forced_ids:
            continue
        ref = int(start + tm.minutes(ORIGIN_ID, n.id))
        hi = min(state.end_by_min - n.estimated_visit_minutes, ref + 480)
        if hi < ref - 30:
            continue
        if not best_arrival_range(n, ctx, max(start, ref - 30), max(hi, ref), step=20):
            continue
        out.append(n)
    out.sort(key=lambda n: (n.progress_km, n.axis_t))
    return out


def optimize(
    graph: JourneyGraph,
    state: PlanState,
    cfg: ModeConfig,
    *,
    previous: list[str] | None = None,
    beam_width: int = 220,
    tm: TravelModel | None = None,
    search_observed: bool = False,
) -> OptResult:
    tm_final = tm or TravelModel(graph)
    # search on one consistent geometric model (optionally letting already-observed legs override it); the final chain uses observed legs
    tm = TravelModel(graph, use_observed=search_observed)
    ctx = graph.time_ctx(state)
    cands = candidate_pool(graph, state, cfg, tm)
    max_meals = 3 if cfg.key == "food_trail" else 2
    max_snacks = 3 if cfg.key == "food_trail" else 2
    forced = set(state.forced_ids)
    previous_set = set(previous or [])
    dest_xy = (graph.destination.latitude, graph.destination.longitude)

    states: list[_State] = [_State(t=float(state.start_min + state.delay_min))]
    for c in cands:
        in_dest_area = haversine_km((c.latitude, c.longitude), dest_xy) <= DEST_AREA_KM
        extra: list[_State] = []
        for s in states:
            if len(s.seq) >= cfg.max_stops:
                continue
            if c.progress_km < s.last_progress - 6.0:  # keep the walk monotone along the route
                continue
            leg = tm.minutes(s.last, c.id)
            arrival = int(round(s.t + leg))
            a = assess(c, arrival, ctx)
            if not a.valid or (a.score < MIN_TEMPORAL and c.id not in forced):
                continue  # only stops that clearly work at the time you get there
            inc = max(0.0, leg + tm.minutes(c.id, DEST_ID) - tm.minutes(s.last, DEST_ID))
            if inc > cfg.max_detour_stop and not in_dest_area and c.id not in forced:
                continue
            if s.detour + inc > cfg.max_detour_total and c.id not in forced:
                continue
            if a.depart_min + tm.minutes(c.id, DEST_ID) > state.end_by_min:
                continue
            if c.role in ("meal", "nightlife") and not in_ideal_window(c, a.start_min) and c.id not in forced:
                continue  # a sit-down meal / night out only makes sense at the right time of day
            if c.role == "meal":
                if s.roles.get("meal", 0) >= max_meals:
                    continue
                if s.last_meal_start is not None and a.start_min - s.last_meal_start < 210:
                    continue
            if c.role == "snack" and s.roles.get("snack", 0) >= max_snacks:
                continue
            if c.role in ("heritage", "museum") and s.roles.get("heritage", 0) + s.roles.get("museum", 0) >= 3:
                continue
            if c.role == "viewpoint" and s.roles.get("viewpoint", 0) >= 2:
                continue
            sc = score_node(c, a, inc, graph.profile, cfg).total
            if sc < cfg.min_score and c.id not in forced:
                continue
            nearby = sum(1 for p in s.progresses if abs(p - c.progress) < 0.05)
            u = stop_utility(c, sc, inc, cfg, s.roles.get(c.role, 0), nearby, day_slot(a.start_min) not in s.slots)
            if c.id in previous_set:
                u += STICKINESS
            if c.id in forced:
                u += 1000.0
            if u <= 0:
                continue
            roles = dict(s.roles)
            roles[c.role] = roles.get(c.role, 0) + 1
            extra.append(
                _State(
                    seq=s.seq + (c.id,),
                    t=float(a.depart_min),
                    last=c.id,
                    detour=s.detour + inc,
                    value=s.value + u,
                    roles=roles,
                    last_meal_start=a.start_min if c.role == "meal" else s.last_meal_start,
                    last_progress=max(s.last_progress, c.progress_km),
                    progresses=s.progresses + (c.progress,),
                    slots=s.slots | {day_slot(a.start_min)},
                )
            )
        merged = states + extra
        merged.sort(key=lambda x: x.value, reverse=True)
        seen: set[tuple[str, ...]] = set()
        states = []
        for m in merged:
            if m.seq in seen:
                continue
            seen.add(m.seq)
            states.append(m)
            if len(states) >= beam_width:
                break

    if forced:
        states = [s for s in states if forced.issubset(set(s.seq))]
        if not states:
            raise InfeasibleRoute("The requested stop cannot be inserted without breaking the plan.")
    best = max(states, key=lambda x: x.value)
    chain = run_chain(graph, list(best.seq), state, tm_final)
    # the exact chain (with observed legs) is authoritative; drop anything that no longer validates
    if not chain.all_valid or chain.arrive_min > state.end_by_min:
        seq = [st.node.id for st in chain.stops if st.assessment.valid]
        chain = run_chain(graph, seq, state, tm_final, skip_invalid=True)
        best.seq = tuple(st.node.id for st in chain.stops)
    return OptResult(sequence=list(best.seq), chain=chain, value=best.value)
