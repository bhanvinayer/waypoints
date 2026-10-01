"""Transparent, journey-specific Waypoint Score.

    Waypoint Score = 0.25 Preference Fit + 0.20 Temporal Fit + 0.20 Route Fit
                   + 0.15 Experience Quality + 0.10 Evidence Reliability + 0.10 Current Relevance

The weights shift per route mode (all five modes are different objective functions over the same graph).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..schemas import ExperienceNode, Reason, Risk, ScoreBreakdown, TemporalAssessment
from .graph import FUEL_INR_PER_KM, PrefProfile
from .timeutils import fmt_clock

# ---------------------------------------------------------------- modes
@dataclass(frozen=True)
class ModeConfig:
    key: str
    label: str
    tagline: str
    weights: tuple[float, float, float, float, float, float]  # pref, temporal, route, quality, evidence, current
    max_stops: int
    max_detour_stop: float
    max_detour_total: float
    max_lateral_km: float
    detour_lambda: float  # utility points lost per detour minute
    stop_cost: float  # utility a stop must beat to be worth including
    min_score: float  # waypoint score floor (0..100)
    role_mult: dict[str, float] = field(default_factory=dict)
    hidden_bonus: float = 0.0
    corridor_bonus: float = 1.12  # "things worth stopping for" ON the way beat generic things at the destination


MODES: dict[str, ModeConfig] = {
    "fastest": ModeConfig("fastest", "Fastest", "Minimum travel time, one worthwhile stop at most", (0.10, 0.20, 0.45, 0.10, 0.10, 0.05),
                          max_stops=2, max_detour_stop=12, max_detour_total=24, max_lateral_km=6, detour_lambda=1.4, stop_cost=50, min_score=62, corridor_bonus=1.0),
    "experience": ModeConfig("experience", "Experience", "Best-fit experiences with sensible detours", (0.25, 0.20, 0.20, 0.15, 0.10, 0.10),
                             max_stops=5, max_detour_stop=45, max_detour_total=140, max_lateral_km=16, detour_lambda=0.30, stop_cost=40, min_score=50,
                             role_mult={"snack": 0.82, "meal": 0.95, "heritage": 1.08, "viewpoint": 1.1, "event": 1.05, "market": 0.95}),
    "food_trail": ModeConfig("food_trail", "Food trail", "Eat your way along the corridor", (0.28, 0.20, 0.15, 0.15, 0.10, 0.12),
                             max_stops=6, max_detour_stop=40, max_detour_total=150, max_lateral_km=18, detour_lambda=0.28, stop_cost=34, min_score=46,
                             role_mult={"meal": 1.35, "snack": 1.3, "market": 1.0, "heritage": 0.8, "museum": 0.7, "viewpoint": 0.85}),
    "scenic": ModeConfig("scenic", "Scenic", "Viewpoints, landscapes and golden-hour photography", (0.27, 0.20, 0.15, 0.15, 0.08, 0.15),
                         max_stops=5, max_detour_stop=50, max_detour_total=150, max_lateral_km=22, detour_lambda=0.24, stop_cost=36, min_score=48,
                         role_mult={"viewpoint": 1.35, "nature": 1.25, "heritage": 1.0, "meal": 0.85, "snack": 0.9, "museum": 0.7, "market": 0.85}),
    "discovery": ModeConfig("discovery", "Discovery", "Unusual, high-interest detours are welcome", (0.30, 0.20, 0.10, 0.15, 0.10, 0.15),
                            max_stops=6, max_detour_stop=75, max_detour_total=210, max_lateral_km=35, detour_lambda=0.14, stop_cost=36, min_score=46,
                            hidden_bonus=14.0),
}

# ---------------------------------------------------------------- preferences
_STYLE_ROLES: dict[str, dict[str, float]] = {
    "food": {"meal": 1.0, "snack": 1.0, "market": 0.45},
    "culture": {"heritage": 1.0, "museum": 1.0, "religious": 0.7, "event": 0.9, "market": 0.45, "activity": 0.35},
    "nature": {"nature": 1.0, "viewpoint": 0.85},
    "photography": {"viewpoint": 1.0, "heritage": 0.85, "nature": 0.7, "market": 0.6, "religious": 0.45, "event": 0.4},
    "scenic": {"viewpoint": 1.0, "nature": 0.9, "heritage": 0.45},
    "adventure": {"activity": 1.0, "nature": 0.6},
}
_STYLE_ALIASES = {
    "foodie": "food", "street food": "food", "eat": "food", "cuisine": "food", "cafes": "food", "cafe": "food", "snacks": "food",
    "heritage": "culture", "history": "culture", "architecture": "culture", "museums": "culture", "art": "culture", "temples": "culture",
    "photo": "photography", "photos": "photography", "sunset": "photography", "views": "scenic", "viewpoints": "scenic",
    "outdoors": "nature", "wildlife": "nature", "hiking": "adventure", "trek": "adventure",
}
_INTEREST_KEYWORDS: dict[str, tuple[list[str], dict[str, float]]] = {
    "street food": (["street food", "chaat", "kachori", "golgappa", "lassi", "tapri", "sweet", "snack", "mithai", "samosa"], {"snack": 1.0, "market": 0.4}),
    "architecture": (["fort", "palace", "haveli", "stepwell", "baori", "architecture", "carved", "mahal", "gate"], {"heritage": 1.0, "museum": 0.5}),
    "hidden places": ([], {}),
    "music": (["music", "folk", "concert", "live"], {"event": 1.0, "nightlife": 0.8}),
    "markets": (["market", "bazaar", "handicraft", "shopping"], {"market": 1.0}),
    "shopping": (["market", "bazaar", "handicraft", "shopping"], {"market": 1.0}),
    "spiritual": (["temple", "mandir", "shrine", "dargah"], {"religious": 1.0}),
    "wildlife": (["wildlife", "sanctuary", "safari", "birds"], {"nature": 1.0}),
    "history": (["fort", "palace", "heritage", "historic", "museum"], {"heritage": 1.0, "museum": 0.9}),
}


def canonical_style(s: str) -> str:
    s = s.strip().lower()
    return _STYLE_ALIASES.get(s, s)


def _node_text(node: ExperienceNode) -> str:
    parts = [node.name, " ".join(node.category), node.description or "", " ".join(r.theme for r in node.reviews), " ".join(r.snippet for r in node.reviews[:4])]
    return " ".join(parts).lower()


def preference_fit(node: ExperienceNode, profile: PrefProfile) -> tuple[float, list[str]]:
    signals: list[float] = []
    matched: list[str] = []
    for style in profile.styles:
        s = canonical_style(style)
        w = _STYLE_ROLES.get(s, {}).get(node.role, 0.0)
        if s == "photography" and (node.sunset_sensitive or any("photo" in r.theme for r in node.reviews)):
            w = max(w, 0.95)
        if w > 0:
            signals.append(w)
            matched.append(s)
    text = _node_text(node)
    for interest in profile.interests:
        key = interest.strip().lower()
        kws, roles = _INTEREST_KEYWORDS.get(key, ([key] if key else [], {}))
        w = roles.get(node.role, 0.0)
        if any(k in text for k in kws if k):
            w = max(w, 0.8)
        if key == "hidden places" and node.hidden_gem:
            w = max(w, 1.0)
        if w <= 0 and key in _STYLE_ROLES:
            w = _STYLE_ROLES[key].get(node.role, 0.0)
        if w > 0:
            signals.append(w)
            matched.append(interest)
    if not profile.styles and not profile.interests:
        return 0.5, []
    if not signals:
        return 0.1, []
    top = max(signals)
    bonus = 0.08 * (sum(1 for s in signals if s >= 0.6) - 1)
    return max(0.0, min(1.0, 0.1 + 0.9 * top + max(0.0, bonus))), list(dict.fromkeys(matched))


def experience_quality(node: ExperienceNode, profile: PrefProfile) -> float:
    """Rating (shrunk by review count) + prominence (log of review volume) + budget fit."""
    n = node.review_count or 0
    if node.rating is None:
        q = 0.45
    else:
        conf = n / (n + 40.0)
        q = max(0.0, min(1.0, (node.rating - 3.0) / 2.0)) * conf + 0.5 * (1 - conf)
    prominence = min(1.0, math.log10(n + 1) / 5.0) if n else 0.2
    if profile.budget_level and node.price_level:
        over = node.price_level - profile.budget_level
        budget = 1.0 if over <= 0 else max(0.2, 1.0 - 0.3 * over)
    else:
        budget = 1.0
    return max(0.0, min(1.0, 0.62 * q + 0.20 * prominence + 0.18 * budget))


def evidence_reliability(node: ExperienceNode) -> float:
    kinds = {e.kind for e in node.evidence}
    s = 0.30 if "maps" in kinds or node.rating is not None else 0.15
    if node.hours_known:
        s += 0.22
    if node.reviews or "reviews" in kinds:
        s += 0.18
    if "search" in kinds:
        s += 0.15
    if "event" in kinds or "news" in kinds:
        s += 0.10
    if node.visit_minutes_source == "observed":
        s += 0.05
    return max(0.0, min(1.0, s))


def current_relevance(node: ExperienceNode, assessment: TemporalAssessment | None) -> float:
    s = 0.5
    for sig in node.current_signals:
        if sig.kind == "event":
            s += 0.3
        elif sig.kind == "news" and sig.severity == "info":
            s += 0.1
        elif sig.severity == "warn" or sig.kind == "closure":
            s -= 0.4
        elif sig.severity == "watch":
            s -= 0.15
    if assessment and assessment.status == "IDEAL_WINDOW" and (node.sunset_sensitive or node.kind == "event"):
        s += 0.2
    return max(0.0, min(1.0, s))


def route_fit(detour_min: float, tau: float = 25.0) -> float:
    return math.exp(-max(0.0, detour_min) / tau)


def score_node(node: ExperienceNode, assessment: TemporalAssessment | None, detour_min: float, profile: PrefProfile, cfg: ModeConfig) -> ScoreBreakdown:
    pref, _ = preference_fit(node, profile)
    pref = max(0.0, min(1.0, pref + node.pref_adjust))  # bounded Experience Curator (LLM) nudge
    temporal = assessment.score if assessment else 0.5
    parts = ScoreBreakdown(
        preference_fit=round(pref, 3),
        temporal_fit=round(temporal, 3),
        route_fit=round(route_fit(detour_min), 3),
        quality=round(experience_quality(node, profile), 3),
        evidence=round(evidence_reliability(node), 3),
        current_relevance=round(current_relevance(node, assessment), 3),
    )
    w = cfg.weights
    total = 100 * (w[0] * parts.preference_fit + w[1] * parts.temporal_fit + w[2] * parts.route_fit + w[3] * parts.quality + w[4] * parts.evidence + w[5] * parts.current_relevance)
    parts.total = round(total, 1)
    return parts


def significance(node: ExperienceNode) -> float:
    """How much of a 'destination' is this? (log of review volume) — 0.55 .. 1.0"""
    n = node.review_count or 0
    return 0.55 + 0.45 * (min(1.0, math.log10(n + 1) / 5.0) if n else 0.2)


def duration_value(node: ExperienceNode) -> float:
    """A 2-hour fort is a bigger experience than a 15-minute photo stop (0.6 .. 1.0)."""
    return min(1.0, 0.5 + node.estimated_visit_minutes / 180.0)


def day_slot(minute: int) -> int:
    return 0 if minute < 11 * 60 + 30 else 1 if minute < 15 * 60 else 2 if minute < 17 * 60 + 30 else 3


def stop_utility(node: ExperienceNode, score_total: float, detour_min: float, cfg: ModeConfig, same_role_before: int = 0, nearby_before: int = 0, new_slot: bool = False) -> float:
    u = score_total * cfg.role_mult.get(node.role, 1.0)
    if node.hidden_gem:
        u += cfg.hidden_bonus
    if 0.06 <= node.progress <= 0.94:
        u *= cfg.corridor_bonus
    u = max(0.0, u - cfg.stop_cost) * significance(node) * duration_value(node)
    u *= 0.94 ** same_role_before
    u *= 0.93 ** min(3, nearby_before)  # spread stops along the corridor instead of stacking them in one place
    if new_slot:
        u *= 1.08  # a day with a morning, an afternoon and a golden-hour stop beats three stops in one window
    return u - cfg.detour_lambda * detour_min


# ---------------------------------------------------------------- explanations
def detour_cost_inr(detour_km: float) -> float:
    return round(detour_km * FUEL_INR_PER_KM / 5) * 5


def build_reasons(node: ExperienceNode, a: TemporalAssessment, detour_min: float, detour_km: float, matched: list[str], next_gap_min: int | None = None) -> list[Reason]:
    r: list[Reason] = []
    if detour_min <= 2:
        r.append(Reason(status="pass", text="Directly on your route (no real detour)"))
    elif detour_min <= 20:
        r.append(Reason(status="pass", text=f"Only +{round(detour_min)} min detour (+{detour_km:.0f} km)"))
    elif detour_min <= 40:
        r.append(Reason(status="warn", text=f"+{round(detour_min)} min detour (+{detour_km:.0f} km) — worth it for the fit"))
    else:
        r.append(Reason(status="warn", text=f"Big detour: +{round(detour_min)} min"))

    tone = "pass" if a.valid and a.score >= 0.7 else "warn" if a.valid else "fail"
    r.append(Reason(status=tone, text=a.reason, provenance="inferred"))

    if matched:
        r.append(Reason(status="pass", text="Matches " + ", ".join(m.lower() for m in matched[:3]) + (" interest" if len(matched) == 1 else " interests")))
    if node.rating:
        n = f" · {node.review_count:,} reviews" if node.review_count else ""
        r.append(Reason(status="pass" if node.rating >= 4.2 else "warn", text=f"{node.rating:.1f}★ on Google Maps{n}", provenance="observed"))
    r.append(Reason(status="pass", text=f"{node.estimated_visit_minutes} min recommended visit", provenance=node.visit_minutes_source))
    for ev in node.events[:1]:
        if ev.start_min is not None:
            r.append(Reason(status="pass", text=f"Live event: {ev.title} ({fmt_clock(ev.start_min)}–{fmt_clock(ev.end_min)})", provenance="observed"))
    if node.hidden_gem:
        r.append(Reason(status="pass", text="Hidden gem: highly rated, still off the tourist radar", provenance="inferred"))
    if next_gap_min is not None:
        r.append(Reason(status="pass" if next_gap_min >= 20 else "warn", text=f"Leaves {next_gap_min} min of travel slack before the next stop", provenance="inferred"))
    return r


def build_risks(node: ExperienceNode, a: TemporalAssessment, detour_min: float) -> list[Risk]:
    out: list[Risk] = []
    if not node.hours_known and node.kind != "event":
        out.append(Risk(code="hours_unverified", label="Opening hours not reported — check before going", severity="medium"))
    if a.slack_min is not None and 0 <= a.slack_min < 20 and a.valid:
        out.append(Risk(code="tight_window", label=f"Only {a.slack_min} min of buffer before it closes/ends", severity="medium"))
    if a.wait_min > 0:
        out.append(Risk(code="wait", label=f"You may wait ~{a.wait_min} min for it to open", severity="low"))
    if node.sunset_sensitive:
        out.append(Risk(code="sunset_dependent", label="Value depends on arriving in the golden-hour window", severity="medium"))
    if node.kind == "event":
        out.append(Risk(code="event_timing", label="Event timing can change — confirm on the organiser's page", severity="medium"))
    if detour_min > 35:
        out.append(Risk(code="long_detour", label="Long detour makes later stops tighter", severity="medium"))
    for sig in node.current_signals:
        if sig.severity in ("warn", "watch"):
            out.append(Risk(code="live_signal", label=sig.title, severity="high" if sig.severity == "warn" else "medium", provenance="observed"))
    if node.review_count is not None and node.review_count < 15:
        out.append(Risk(code="few_reviews", label="Few reviews — limited evidence", severity="low", provenance="observed"))
    return out
