"""PLAN STRESS TEST — deterministic what-if simulation over the Temporal Experience Graph.

This is NOT future prediction. It re-runs the same temporal validation with a disruption applied
(provenance = SIMULATED), reports which stops survive, and asks the repair module for validated replacements.
"""
from __future__ import annotations

from ..schemas import (
    ExperienceNode, PlanState, RecoveryOp, RecoveryPlan, Robustness, StressRequest, StressResult, StressStop,
)
from .assemble import make_timeline, make_waypoints
from .graph import ChainResult, JourneyGraph, TravelModel, run_chain
from .repair import best_replacement, evaluate_slot
from .scoring import MODES, ModeConfig, score_node
from .temporal import tone_for
from .timeutils import fmt_clock

SCENARIO_LABELS = {
    "delay": "{m} min delay",
    "flight_delay": "Flight delayed {m} min",
    "stop_overrun": "Previous stop runs {m} min long",
    "stop_closed": "Stop closed",
    "event_delayed": "Event pushed by {m} min",
    "skip_stop": "Skip a stop",
}
ROBUSTNESS_DELAYS = [(15, 0.15), (30, 0.30), (45, 0.30), (60, 0.25)]


# ------------------------------------------------------------------ scenario application
def apply_scenario(graph: JourneyGraph, state: PlanState, seq: list[str], req: StressRequest) -> tuple[PlanState, list[str], str | None, bool, str | None]:
    """Returns (state', seq', label_stop_id, applicable, note)."""
    st = state.model_copy(deep=True)
    seq2 = list(seq)
    stop_id = req.stop_id if req.stop_id in seq else None
    m = max(5, min(240, req.minutes or 45))

    if req.scenario in ("delay", "flight_delay"):
        st.delay_min += m
        return st, seq2, None, True, None
    if req.scenario == "stop_overrun":
        sid = stop_id or (seq[0] if seq else None)
        if not sid:
            return st, seq2, None, False, "This route has no stops yet."
        st.overruns = {**st.overruns, sid: st.overruns.get(sid, 0) + m}
        return st, seq2, sid, True, None
    if req.scenario == "stop_closed":
        if not seq:
            return st, seq2, None, False, "This route has no stops yet."
        sid = stop_id or max(seq, key=lambda i: graph.nodes[i].scores.total)
        st.closed_ids = [*st.closed_ids, sid]
        return st, seq2, sid, True, None
    if req.scenario == "event_delayed":
        has_event = any(w.kind == "event" for i in seq for w in graph.nodes[i].windows)
        if not has_event:
            return st, seq2, None, False, "No stop in this route is tied to an event time — nothing to push."
        st.event_shift_min += m if m != 45 else 30
        return st, seq2, None, True, None
    if req.scenario == "skip_stop":
        if not seq:
            return st, seq2, None, False, "This route has no stops yet."
        sid = stop_id or seq[0]
        seq2 = [i for i in seq2 if i != sid]
        return st, seq2, sid, True, None
    return st, seq2, None, False, "Unknown scenario"


def _after_status(graph: JourneyGraph, chain: ChainResult, nid: str):
    for s in chain.stops:
        if s.node.id == nid:
            return s.arrival, s.assessment, False
    for s in chain.skipped:
        if s.node.id == nid:
            return s.arrival, s.assessment, True
    return None, None, True


def _round_extra(chain_after: ChainResult, chain_before: ChainResult) -> int:
    return int(round(chain_after.travel_minutes - chain_before.travel_minutes))


# ------------------------------------------------------------------ robustness
def compute_robustness(graph: JourneyGraph, state: PlanState, seq: list[str], cfg: ModeConfig, tm: TravelModel | None = None) -> Robustness:
    tm = tm or TravelModel(graph)
    if not seq:
        return Robustness(
            score=96, label="Very robust", delay_survival=1.0, buffer=1.0, fallback_cover=1.0, window_flex=1.0,
            explanation="This route has no timed stops, so almost nothing can break — only the drive itself.",
        )
    base = run_chain(graph, seq, state, tm)
    weights = {s.node.id: max(10.0, graph.nodes[s.node.id].scores.total or 50.0) for s in base.stops}
    total_w = sum(weights.values()) or 1.0

    tested: list[dict] = []
    delay_survival = 0.0
    first_break: tuple[int, str] | None = None
    clean_delay = 0
    for d, w in ROBUSTNESS_DELAYS:
        st = state.model_copy(update={"delay_min": state.delay_min + d})
        ch = run_chain(graph, seq, st, tm, skip_invalid=True)
        kept_w = sum(weights.get(s.node.id, 10.0) for s in ch.stops)
        frac = kept_w / total_w
        if ch.arrive_min > state.end_by_min + 30:
            frac *= 0.6
        lost = [s.node.name for s in ch.skipped]
        tested.append({"delay_min": d, "preserved": len(ch.stops), "total": len(seq), "lost": lost, "arrive_min": ch.arrive_min})
        delay_survival += w * frac
        if not lost and frac >= 0.999:
            clean_delay = d
        elif first_break is None and lost:
            first_break = (d, lost[0])

    slacks = []
    weakest: tuple[int, str] | None = None
    for s in base.stops:
        sl = s.assessment.slack_min
        v = 0.6 if sl is None else max(0.0, min(1.0, sl / 45.0))
        slacks.append(v)
        if sl is not None and (weakest is None or sl < weakest[0]):
            weakest = (sl, s.node.id)
    buffer = sum(slacks) / len(slacks)

    covered = 0
    for i, nid in enumerate(seq):
        if best_replacement(graph, state, seq, i, cfg, tm, limit=1):
            covered += 1
    fallback_cover = covered / len(seq)

    strict = sum(1 for i in seq if graph.nodes[i].sunset_sensitive or any(w.kind == "event" for w in graph.nodes[i].windows))
    window_flex = 1.0 - 0.6 * strict / len(seq)

    score = int(round(100 * (0.45 * delay_survival + 0.25 * buffer + 0.20 * fallback_cover + 0.10 * window_flex)))
    score = max(5, min(99, score))
    label = "Very robust" if score >= 85 else "Robust" if score >= 70 else "Moderately robust" if score >= 50 else "Fragile"

    if clean_delay >= 60:
        core = "absorbs a 60-minute delay without losing a single experience"
    elif clean_delay > 0:
        core = f"absorbs a {clean_delay}-minute delay without losing any of its {len(seq)} experiences"
    else:
        core = "has no slack: even a 15-minute delay costs an experience"
    tail = ""
    if first_break:
        tail = f" At +{first_break[0]} min, {first_break[1]} stops fitting."
    fb = f" {covered} of {len(seq)} stops have a validated fallback." if len(seq) else ""
    explanation = f"Your route {core}.{tail}{fb}"
    return Robustness(
        score=score, label=label, explanation=explanation,
        delay_survival=round(delay_survival, 3), buffer=round(buffer, 3), fallback_cover=round(fallback_cover, 3), window_flex=round(window_flex, 3),
        min_slack_min=weakest[0] if weakest else None, weakest_stop_id=weakest[1] if weakest else None, tested=tested,
    )


# ------------------------------------------------------------------ the full stress test
def run_stress_test(graph: JourneyGraph, state: PlanState, seq: list[str], req: StressRequest, cfg: ModeConfig | None = None) -> StressResult:
    cfg = cfg or MODES[state.mode]
    tm = TravelModel(graph)
    before = run_chain(graph, seq, state, tm)
    robustness_before = compute_robustness(graph, state, seq, cfg, tm)
    st2, seq2, focus_id, applicable, note = apply_scenario(graph, state, seq, req)
    label = SCENARIO_LABELS[req.scenario].format(m=max(5, min(240, req.minutes or 45)) if req.scenario != "event_delayed" else (req.minutes if req.minutes != 45 else 30))
    if focus_id and req.scenario in ("stop_closed", "skip_stop", "stop_overrun"):
        label += f": {graph.nodes[focus_id].name}"

    if not applicable:
        return StressResult(
            scenario=req.scenario, label=label, minutes=req.minutes, stop_id=req.stop_id, applicable=False, note=note,
            verdict="SURVIVED", outcome="SURVIVED", headline="NOT APPLICABLE", stops=[], broken=0, at_risk=0,
            robustness_before=robustness_before.score, explanation=note or "", provenance="simulated",
        )

    after = run_chain(graph, seq2, st2, tm, skip_invalid=True)
    stops: list[StressStop] = []
    broken = at_risk = 0
    for s in before.stops:
        nid = s.node.id
        arr, a, skipped = _after_status(graph, after, nid)
        skipped_by_user = req.scenario == "skip_stop" and nid == focus_id
        if skipped_by_user:
            stops.append(StressStop(stop_id=nid, name=s.node.name, role=s.node.role, before_arrival_min=s.arrival, before_status=s.assessment.status,
                                    before_tone=tone_for(s.assessment), after_tone="gray", after_reason="Skipped by you", skipped=True,
                                    before_slack_min=s.assessment.slack_min))
            continue
        tone = tone_for(a)
        if a is not None and not a.valid:
            broken += 1
        elif tone == "yellow":
            at_risk += 1
        stops.append(StressStop(
            stop_id=nid, name=s.node.name, role=s.node.role, before_arrival_min=s.arrival, before_status=s.assessment.status,
            before_tone=tone_for(s.assessment), after_arrival_min=arr, after_status=a.status if a else None, after_tone=tone,
            after_reason=a.reason if a else "", before_slack_min=s.assessment.slack_min, after_slack_min=a.slack_min if a else None, skipped=skipped,
        ))

    verdict = "SURVIVED" if broken == 0 else "BREAK_DETECTED"
    recovery: RecoveryPlan | None = None
    outcome = "SURVIVED"
    robustness_after: int | None = None
    if broken:
        recovery = plan_recovery(graph, st2, seq2, before, cfg, tm, protect_focus=focus_id if req.scenario == "stop_closed" else None)
        outcome = "RECOVERED" if recovery.fully_recovered and any(o.type == "replace" for o in recovery.ops) else \
            "PARTIALLY_RECOVERED" if recovery.experiences_preserved > 0 else "NOT_RECOVERABLE"
        if recovery.fully_recovered and not any(o.type == "replace" for o in recovery.ops):
            outcome = "PARTIALLY_RECOVERED"
        robustness_after = compute_robustness(graph, st2, recovery.new_sequence, cfg, tm).score
    else:
        robustness_after = compute_robustness(graph, st2, [i for i in seq2], cfg, tm).score

    headline = "YOUR PLAN SURVIVED" if verdict == "SURVIVED" else ("PLAN RECOVERED" if outcome == "RECOVERED" else "PLAN BREAK DETECTED")
    explanation = _explain(label, stops, recovery, verdict, after, before)
    return StressResult(
        scenario=req.scenario, label=label, minutes=req.minutes, stop_id=focus_id or req.stop_id, verdict=verdict, outcome=outcome,
        headline=headline, stops=stops, broken=broken, at_risk=at_risk, recovery=recovery,
        robustness_before=robustness_before.score, robustness_after=robustness_after, explanation=explanation, provenance="simulated",
    )


def _explain(label: str, stops: list[StressStop], rec: RecoveryPlan | None, verdict: str, after: ChainResult, before: ChainResult) -> str:
    lost = [s for s in stops if s.after_tone == "red"]
    if verdict == "SURVIVED":
        shaky = [s.name for s in stops if s.after_tone == "yellow"]
        extra = f" {', '.join(shaky)} get tight." if shaky else ""
        return f"Simulated: {label}. Every stop still validates at its new arrival time.{extra}"
    bits = "; ".join(f"{s.name} ({s.after_reason})" for s in lost[:3])
    out = f"Simulated: {label}. {len(lost)} stop(s) no longer fit — {bits}."
    if rec:
        out += f" Recovery keeps {rec.experiences_preserved} of {rec.experiences_total} experiences for {rec.extra_travel_minutes:+d} min of travel."
    return out


# ------------------------------------------------------------------ recovery
def plan_recovery(
    graph: JourneyGraph,
    state: PlanState,
    seq: list[str],
    before: ChainResult,
    cfg: ModeConfig,
    tm: TravelModel,
    protect_focus: str | None = None,
) -> RecoveryPlan:
    """Replace or drop every stop that fails under `state`; every replacement is validated by the temporal engine."""
    cur = list(seq)
    ops: list[RecoveryOp] = []
    used: set[str] = set()
    original_ids = [s.node.id for s in before.stops]
    for _ in range(len(seq) + 3):
        chain = run_chain(graph, cur, state, tm)
        bad_idx = next((i for i, s in enumerate(chain.stops) if not s.assessment.valid), None)
        if bad_idx is None:
            break
        failed = chain.stops[bad_idx]
        protect = {s.node.id for s in chain.stops[bad_idx + 1:] if s.assessment.valid}
        base_t = before.travel_minutes
        cands = best_replacement(graph, state, cur, bad_idx, cfg, tm, exclude=used | {failed.node.id}, base_travel=base_t, limit=1, protect=protect)
        if cands:
            ev = cands[0]
            new_node = graph.nodes[ev.node_id]
            ops.append(RecoveryOp(
                type="replace", removed_id=failed.node.id, removed_name=failed.node.name, added=new_node,
                reason=failed.assessment.reason, arrival_min=ev.arrival_min, status=ev.status, detour_min=round(ev.detour_min, 1),
                extra_travel_min=round(ev.extra_travel_min, 1), score=ev.score,
                why=(f"{failed.node.name} was removed because {failed.assessment.reason[0].lower() + failed.assessment.reason[1:]}. "
                     f"{new_node.name} validates at the new arrival time ({fmt_clock(ev.arrival_min)}, {ev.status.replace('_', ' ').lower()}) "
                     f"with a +{round(ev.detour_min)} min detour."),
            ))
            cur[bad_idx] = ev.node_id
            used.add(ev.node_id)
            used.add(failed.node.id)
        else:
            ops.append(RecoveryOp(
                type="drop", removed_id=failed.node.id, removed_name=failed.node.name, reason=failed.assessment.reason,
                why=f"{failed.node.name} no longer fits and no nearby alternative validates at the new time, so it is dropped.",
            ))
            used.add(failed.node.id)
            cur.pop(bad_idx)
    final = run_chain(graph, cur, state, tm, skip_invalid=True)
    final_seq = [s.node.id for s in final.stops]
    waypoints = make_waypoints(graph, final, cfg)
    timeline = make_timeline(graph, final, state, waypoints)
    preserved = len([i for i in original_ids if i in final_seq])
    fully = final.all_valid and final.arrive_min <= state.end_by_min and not final.skipped
    narrative = " ".join(o.why for o in ops) or "Nothing needed replacing."
    return RecoveryPlan(
        ops=ops, new_sequence=final_seq, new_waypoints=waypoints, new_timeline=timeline,
        extra_travel_minutes=_round_extra(final, before), experiences_preserved=preserved, experiences_total=len(original_ids),
        arrive_before_min=before.arrive_min, arrive_after_min=final.arrive_min, fully_recovered=fully, narrative=narrative,
    )
