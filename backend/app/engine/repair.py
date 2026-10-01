"""Automatic Route Recovery.

When a waypoint fails, the backend (not the LLM) does the work:
  1. identify the failed node and why it failed
  2. take fallback candidates from the graph
  3. validate each one temporally at the slot's *actual* (disrupted) arrival time
  4. calculate detour / extra travel
  5. check downstream effects (every later stop must still validate)
  6. select the replacement with the best score
  7. recompute the route
The LLM is only asked afterwards to explain the result in words.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..schemas import ExperienceNode, PlanState
from .graph import ChainResult, JourneyGraph, TravelModel, run_chain
from .scoring import ModeConfig, score_node

_ROLE_FAMILY = {
    "meal": {"meal", "snack"},
    "snack": {"snack", "meal"},
    "heritage": {"heritage", "museum", "religious", "viewpoint"},
    "museum": {"museum", "heritage", "religious"},
    "viewpoint": {"viewpoint", "nature", "heritage"},
    "nature": {"nature", "viewpoint"},
    "market": {"market", "snack"},
    "event": {"event", "nightlife", "activity"},
    "nightlife": {"nightlife", "event", "meal"},
    "religious": {"religious", "heritage"},
    "activity": {"activity", "nature"},
}


def compatible(a: str, b: str) -> bool:
    return a == b or b in _ROLE_FAMILY.get(a, {a})


@dataclass
class SlotEval:
    ok: bool
    node_id: str
    score: float
    detour_min: float
    extra_travel_min: float
    arrival_min: int
    status: str
    chain: ChainResult | None
    reason: str = ""
    chain_value: float = 0.0


def evaluate_slot(
    graph: JourneyGraph,
    state: PlanState,
    seq: list[str],
    index: int,
    cand_id: str,
    cfg: ModeConfig,
    tm: TravelModel,
    *,
    replace: bool = True,
    base_travel: float | None = None,
    protect: set[str] | None = None,
) -> SlotEval:
    """Try `cand_id` at position `index` (replacing the node there when replace=True) and validate everything.

    `protect` limits the downstream check to stops that were valid before (others are handled by later repairs)."""
    new_seq = list(seq)
    if replace and index < len(new_seq):
        new_seq[index] = cand_id
    else:
        new_seq.insert(index, cand_id)
    chain = run_chain(graph, new_seq, state, tm)
    pos = new_seq.index(cand_id)
    stop = chain.stops[pos]
    # downstream effects: every (protected) stop AFTER the slot must still be valid
    downstream = [s for s in chain.stops[pos + 1:] if protect is None or s.node.id in protect]
    bad = next((s for s in downstream if not s.assessment.valid), None)
    if not stop.assessment.valid:
        return SlotEval(False, cand_id, 0.0, stop.detour_min, 0.0, stop.arrival, stop.assessment.status, chain, stop.assessment.reason)
    if chain.arrive_min > state.end_by_min:
        return SlotEval(False, cand_id, 0.0, stop.detour_min, 0.0, stop.arrival, stop.assessment.status, chain, "Would arrive after your end-of-day limit")
    if bad is not None:
        return SlotEval(False, cand_id, 0.0, stop.detour_min, 0.0, stop.arrival, stop.assessment.status, chain, f"Would break {bad.node.name}")
    sc = score_node(graph.nodes[cand_id], stop.assessment, stop.detour_min, graph.profile, cfg).total
    # value of the WHOLE recovered chain: a replacement that leaves a later sunset stop at its ideal time beats one that doesn't
    chain_value = sum(score_node(s.node, s.assessment, s.detour_min, graph.profile, cfg).total for s in chain.stops)
    bt = base_travel if base_travel is not None else 0.0
    return SlotEval(True, cand_id, sc, stop.detour_min, chain.travel_minutes - bt, stop.arrival, stop.assessment.status, chain, chain_value=chain_value)


def best_replacement(
    graph: JourneyGraph,
    state: PlanState,
    seq: list[str],
    index: int,
    cfg: ModeConfig,
    tm: TravelModel,
    *,
    exclude: set[str] | None = None,
    same_role_only: bool = False,
    base_travel: float | None = None,
    limit: int = 3,
    protect: set[str] | None = None,
) -> list[SlotEval]:
    """Rank validated replacements for the stop at `index` (best first)."""
    failed = graph.nodes[seq[index]]
    exclude = (exclude or set()) | set(seq) | set(state.excluded_ids) | set(state.closed_ids)
    evals: list[SlotEval] = []
    for n in graph.nodes.values():
        if n.id in exclude:
            continue
        if same_role_only and n.role != failed.role:
            continue
        if not compatible(failed.role, n.role):
            continue
        if n.lateral_km > cfg.max_lateral_km:
            continue
        ev = evaluate_slot(graph, state, seq, index, n.id, cfg, tm, base_travel=base_travel, protect=protect)
        if ev.ok:
            evals.append(ev)
    # prefer high score, then low extra travel
    evals.sort(key=lambda e: (e.chain_value - 0.35 * max(0.0, e.detour_min)), reverse=True)
    return evals[:limit]


def compute_fallbacks(graph: JourneyGraph, state: PlanState, seq: list[str], cfg: ModeConfig, tm: TravelModel, k: int = 3) -> dict[str, list[str]]:
    """Pre-validated fallback node ids for every selected stop (used by the cards and the stress test)."""
    base = run_chain(graph, seq, state, tm).travel_minutes
    out: dict[str, list[str]] = {}
    for i, nid in enumerate(seq):
        out[nid] = [e.node_id for e in best_replacement(graph, state, seq, i, cfg, tm, base_travel=base, limit=k)]
    return out
