"""Temporal fit: does an experience actually work at the moment the traveller will be there?

    arrival time + opening hours + estimated visit duration (+ event / sunset windows)
        -> OPEN_AT_ARRIVAL | IDEAL_WINDOW | CLOSING_TOO_SOON | NOT_OPEN | EVENT_CONFLICT | WINDOW_MISSED | UNKNOWN_HOURS

Everything here is deterministic. Opening hours / events are OBSERVED (SerpApi); the verdict is INFERRED.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from ..schemas import ExperienceNode, ExperienceWindow, TemporalAssessment, Tone
from .parsing import intervals_for_date
from .timeutils import fmt_clock

WAIT_TOLERANCE_MIN = 30  # we accept waiting this long for a venue to open
EVENT_WAIT_TOLERANCE_MIN = 45
VALID_THRESHOLD = 0.4

# "ideal" experience windows by role (minutes after midnight)
_IDEAL: dict[str, list[tuple[int, int]]] = {
    "meal": [(12 * 60, 15 * 60), (18 * 60 + 30, 22 * 60)],
    "snack": [(8 * 60, 21 * 60)],
    "heritage": [(9 * 60, 16 * 60 + 30)],
    "museum": [(9 * 60, 16 * 60 + 30)],
    "religious": [(6 * 60, 19 * 60 + 30)],
    "nature": [(6 * 60 + 30, 17 * 60 + 30)],
    "market": [(10 * 60, 20 * 60 + 30)],
    "nightlife": [(19 * 60 + 30, 25 * 60)],
    "viewpoint": [(6 * 60, 19 * 60)],
    "activity": [(9 * 60, 17 * 60)],
}
_OFF_IDEAL_FACTOR = {"meal": 0.65, "nightlife": 0.6, "market": 0.9, "snack": 0.9, "viewpoint": 0.85}


@dataclass
class TimeCtx:
    date: date
    sunset_min: int | None = None
    wait_tolerance: int = WAIT_TOLERANCE_MIN
    event_shift_min: int = 0
    closed_ids: set[str] = field(default_factory=set)


def ideal_windows(node: ExperienceNode) -> list[tuple[int, int]]:
    name = node.name.lower()
    if node.role == "snack" and any(k in name for k in ("street food", "chaat", "golgappa", "pani puri")):
        return [(16 * 60, 21 * 60 + 30)]
    if node.role == "snack" and any(k in name for k in ("kachori", "breakfast", "poha", "jalebi")):
        return [(7 * 60, 12 * 60)]
    return _IDEAL.get(node.role, [(8 * 60, 20 * 60)])


def in_ideal_window(node: ExperienceNode, minute: int) -> bool:
    return any(a <= minute <= b for a, b in ideal_windows(node))


def tone_for(a: TemporalAssessment | None) -> Tone:
    if a is None:
        return "gray"
    if not a.valid:
        return "red"
    return "green" if a.score >= 0.7 else "yellow"


def shifted_windows(node: ExperienceNode, ctx: TimeCtx) -> list[ExperienceWindow]:
    out = []
    for w in node.windows:
        if w.kind == "event":
            out.append(w.model_copy(update={"start_min": w.start_min + ctx.event_shift_min, "end_min": w.end_min + ctx.event_shift_min}))
    return out


def _result(node: ExperienceNode, status, score: float, arrival: int, start: int, reason: str, *, valid: bool | None = None,
            wait: int = 0, win: tuple[int, int] | None = None, slack: int | None = None, prov="inferred") -> TemporalAssessment:
    score = max(0.0, min(1.0, score))
    depart = start + node.estimated_visit_minutes
    return TemporalAssessment(
        status=status,
        score=round(score, 3),
        arrival_min=arrival,
        start_min=start,
        depart_min=depart,
        wait_min=wait,
        slack_min=slack,
        window_start_min=win[0] if win else None,
        window_end_min=win[1] if win else None,
        reason=reason,
        valid=(score >= VALID_THRESHOLD) if valid is None else valid,
        provenance=prov,
    )


def _assess_event(node: ExperienceNode, arrival: int, ctx: TimeCtx) -> TemporalAssessment:
    visit = node.estimated_visit_minutes
    windows = shifted_windows(node, ctx)
    best: TemporalAssessment | None = None
    shift_note = f" (event pushed {ctx.event_shift_min:+d} min)" if ctx.event_shift_min else ""
    for w in windows:
        start, end = w.start_min, w.end_min
        win = (start, end)
        if arrival > end - 20:
            cand = _result(node, "EVENT_CONFLICT", 0.0, arrival, arrival,
                           f"Event ends {fmt_clock(end)}; you arrive {fmt_clock(arrival)}{shift_note}", valid=False, win=win, slack=end - arrival)
        else:
            wait = max(0, start - arrival)
            if wait > EVENT_WAIT_TOLERANCE_MIN:
                cand = _result(node, "NOT_OPEN", 0.0, arrival, start,
                               f"Event starts {fmt_clock(start)} — {wait} min after you arrive{shift_note}", valid=False, wait=wait, win=win)
            else:
                begin = max(arrival, start)
                available = end - begin
                depart_eff = begin + min(visit, available)
                if available >= min(visit, 30):  # 30+ minutes of a live event is still worth it
                    ideal = begin <= start + 20
                    full = available >= min(visit, 60)
                    score = (1.0 if ideal and wait <= 20 else 0.8) if full else 0.6
                    if available < visit and full:
                        score = min(score, 0.7)
                    cand = _result(node, "IDEAL_WINDOW" if ideal else "OPEN_AT_ARRIVAL", score, arrival, begin,
                                   (f"Event {fmt_clock(start)}–{fmt_clock(end)}; you arrive {fmt_clock(arrival)}" + (f" and wait {wait} min" if wait else " in time for the start" if ideal else f" with {available} min of it left") + shift_note),
                                   wait=wait, win=win, slack=end - depart_eff)
                else:
                    cand = _result(node, "CLOSING_TOO_SOON", 0.3, arrival, begin,
                                   f"Only {available} min of the event left{shift_note}", valid=False, wait=wait, win=win, slack=available - visit)
        if best is None or cand.score > best.score:
            best = cand
    if best is None:
        return _result(node, "UNKNOWN_HOURS", 0.45, arrival, arrival, "Event time not reported", valid=True)
    best.provenance = "inferred"
    return best


def assess(node: ExperienceNode, arrival: int, ctx: TimeCtx) -> TemporalAssessment:
    """Temporal fit of `node` for a traveller arriving at minute `arrival` of the journey date."""
    visit = node.estimated_visit_minutes

    if node.id in ctx.closed_ids:
        return _result(node, "NOT_OPEN", 0.0, arrival, arrival, "Marked closed in this what-if scenario", valid=False, prov="simulated")

    if node.kind == "event" or any(w.kind == "event" for w in node.windows):
        base = _assess_event(node, arrival, ctx)
        return _apply_sunset(node, base, ctx)

    ideal_ok = False
    if not node.hours_known:
        ideal_ok = in_ideal_window(node, arrival)
        outdoor = node.role in ("viewpoint", "nature", "market")
        score = (0.7 if outdoor else 0.55) if ideal_ok else (0.5 if outdoor else 0.42)
        base = _result(node, "UNKNOWN_HOURS", score, arrival, arrival, "Opening hours not reported by Google Maps — verify before going", valid=True)
        return _apply_sunset(node, base, ctx)

    ivs = intervals_for_date(node.opening_hours, ctx.date)
    if not ivs:
        return _result(node, "NOT_OPEN", 0.0, arrival, arrival, "Closed all day on this date", valid=False)

    chosen: tuple[int, int, int] | None = None  # (open, close, start)
    for o, c in ivs:
        if arrival < o:
            if o - arrival <= ctx.wait_tolerance:
                chosen = (o, c, o)
                break
        elif arrival < c:
            chosen = (o, c, arrival)
            break
    if chosen is None:
        later = [o for o, _ in ivs if o > arrival]
        if later:
            reason = f"Opens {fmt_clock(min(later))}; you arrive {fmt_clock(arrival)}"
        else:
            reason = f"Closed at {fmt_clock(ivs[-1][1])}; you arrive {fmt_clock(arrival)}"
        return _result(node, "NOT_OPEN", 0.0, arrival, arrival, reason, valid=False, win=(ivs[0][0], ivs[-1][1]))

    o, c, start = chosen
    wait = start - arrival
    remaining = c - start
    win = (o, c)
    if remaining >= visit:
        buffer = remaining - visit
        score = 0.85 + 0.15 * min(1.0, buffer / 60.0)
        if buffer < 15:
            score = 0.8
        status = "OPEN_AT_ARRIVAL"
        hours = "Open 24 hours" if o <= 0 and c >= 1440 else f"Open {fmt_clock(o)}–{fmt_clock(c)}"
        reason = f"{hours}; you arrive {fmt_clock(arrival)}" + (f" (wait {wait} min)" if wait else "") + (f" with {buffer} min to spare" if buffer < 240 else "")
        slack = buffer
        mid = start
        if in_ideal_window(node, mid):
            status = "IDEAL_WINDOW"
        else:
            score *= _OFF_IDEAL_FACTOR.get(node.role, 0.95)
            if node.role in ("meal", "nightlife"):
                reason += " — outside the usual time for this kind of stop"
    elif remaining >= 0.75 * visit:
        score = 0.4 + 0.1 * (remaining / visit)
        status = "CLOSING_TOO_SOON"
        reason = f"Closes {fmt_clock(c)} — only {remaining} min of your {visit} min visit"
        slack = remaining - visit
    else:
        score = 0.25 * remaining / max(1.0, 0.75 * visit)
        status = "CLOSING_TOO_SOON"
        reason = f"Closes {fmt_clock(c)} — only {remaining} min left, you need {visit}"
        slack = remaining - visit
    base = _result(node, status, score, arrival, start, reason, wait=wait, win=win, slack=slack,
                   valid=None if status != "CLOSING_TOO_SOON" else (remaining >= 0.75 * visit))
    return _apply_sunset(node, base, ctx)


def _apply_sunset(node: ExperienceNode, base: TemporalAssessment, ctx: TimeCtx) -> TemporalAssessment:
    """Sunset-sensitive stops (sunset OBSERVED in reviews/description) must have the visit overlap the golden hour."""
    if not node.sunset_sensitive or ctx.sunset_min is None or not base.valid:
        return base
    s = ctx.sunset_min
    start = base.start_min
    visit = node.estimated_visit_minutes
    golden_start = s - visit - 10  # arrive early enough to still be there when the sun goes down
    if golden_start <= start <= s + 5:
        status = "IDEAL_WINDOW" if base.status != "UNKNOWN_HOURS" else base.status
        reason = f"{base.reason}; sunset {fmt_clock(s)} — you are there for the golden hour"
        return base.model_copy(update={"status": status, "reason": reason, "score": max(base.score, 0.9) if status == "IDEAL_WINDOW" else base.score})
    if start < golden_start:
        early = golden_start - start
        if early <= 60:  # arrive early and settle in for the golden hour (reviewers advise it for crowded sunset spots)
            return base.model_copy(update={
                "status": "IDEAL_WINDOW" if base.status != "UNKNOWN_HOURS" else base.status,
                "start_min": golden_start, "depart_min": golden_start + visit, "wait_min": base.wait_min + early,
                "score": min(base.score, 0.85),
                "reason": f"{base.reason}; arrive ~{early} min early and stay for sunset ({fmt_clock(s)})",
            })
        return base.model_copy(update={"score": 0.3, "valid": False, "reason": f"{base.reason}; far too early for sunset ({fmt_clock(s)})"})
    late = start - s
    if late <= 15:
        return base.model_copy(update={"score": min(base.score, 0.5), "reason": f"{base.reason}; just after sunset ({fmt_clock(s)}) — afterglow only"})
    return base.model_copy(update={
        "status": "WINDOW_MISSED",
        "score": 0.15,
        "valid": False,
        "reason": f"Sunset was {fmt_clock(s)}; you would arrive {fmt_clock(start)} and miss the golden hour",
    })


def best_arrival_range(node: ExperienceNode, ctx: TimeCtx, lo: int, hi: int, step: int = 15) -> bool:
    """Is there ANY arrival time in [lo, hi] at which the node is valid? (used for the broad temporal filter)"""
    t = lo
    while t <= hi:
        if assess(node, t, ctx).valid:
            return True
        t += step
    return False
