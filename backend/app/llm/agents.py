"""The WAYPOINTS reasoning modules.

LLM-backed (Groq, open-source models) — each has a deterministic fallback and strict output validation:
  1 Journey Analyst      request            -> structured journey requirements
  2 Discovery Planner    requirements+route -> which SerpApi searches to run, and where
  3 Experience Curator   candidates         -> bounded preference nudges, role fixes, review-grounded one-liners, news triage
  6 Stress Tester        simulation result  -> plain-language explanation of what broke and why
  7 Recovery Planner     repair result      -> "Why was it replaced?" explanation
  8 Trip Narrator        final plan         -> headline + summary

Pure code (see engine/): 4 Temporal Validator (temporal.py), 5 Route Optimizer (optimizer.py),
and the deterministic core of 6/7 (stress.py / repair.py).

Hard rule: the LLM only reasons over structured evidence handed to it. Numbers in its prose must be present in that
evidence, ids must exist, enums must be valid — otherwise the output is discarded.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from ..engine.parsing import parse_budget
from ..engine.scoring import canonical_style
from ..engine.timeutils import fmt_clock, fmt_duration, parse_clock
from ..schemas import AnalyzeResponse, JourneyRequest, Narrative, ROUTE_MODES
from ..trace import StepTimer
from .groq_client import get_groq

STYLES = ["fast", "scenic", "food", "culture", "nature", "photography", "adventure"]
ROLES = ["meal", "snack", "heritage", "museum", "viewpoint", "nature", "market", "event", "nightlife", "religious", "activity", "other"]

SYSTEM_RULES = (
    "You are a module inside WAYPOINTS, a temporal route-planning engine. "
    "You reason ONLY over the structured evidence you are given (retrieved from SerpApi). "
    "Never invent places, opening hours, events, ratings, prices, distances or times. "
    "If something is not in the evidence, do not mention it. Return a single JSON object and nothing else."
)


# ------------------------------------------------------------------------------------------------ guards
def numbers_grounded(text: str, evidence: Any) -> bool:
    blob = evidence if isinstance(evidence, str) else json.dumps(evidence, ensure_ascii=False)
    for tok in re.findall(r"\d+(?::\d+)?", text):
        if tok not in blob:
            return False
    return True


def _clean_str(v: Any, limit: int = 240) -> str | None:
    if not isinstance(v, str):
        return None
    v = " ".join(v.split())
    return v[:limit] if v else None


# ------------------------------------------------------------------------------------------------ 1. analyst
def _canon_styles(req: JourneyRequest) -> list[str]:
    raw = [*req.travel_styles, req.travel_style] if req.travel_style else [*req.travel_styles]
    out: list[str] = []
    for s in raw:
        for part in str(s).replace("+", ",").split(","):
            c = canonical_style(part)
            if c in STYLES and c not in out:
                out.append(c)
    return out


def recommended_mode_for(styles: list[str], explicit: str | None) -> str:
    if explicit in ROUTE_MODES:
        return explicit  # type: ignore[return-value]
    if styles[:1] == ["fast"]:
        return "fastest"
    if "food" in styles and len(styles) == 1:
        return "food_trail"
    if styles and all(s in ("scenic", "nature", "photography") for s in styles):
        return "scenic"
    if styles[:1] == ["adventure"]:
        return "discovery"
    return "experience"


async def journey_analyst(req: JourneyRequest, start_min: int, end_min: int) -> AnalyzeResponse:
    styles = _canon_styles(req)
    interests = [i.strip() for i in req.interests if i and i.strip()][:8]
    span = (start_min, end_min)
    wants = {
        "breakfast": start_min <= 9 * 60 + 30,
        "lunch": span[0] <= 13 * 60 and span[1] >= 13 * 60 + 30,
        "dinner": span[1] >= 19 * 60 + 30,
    }
    base = AnalyzeResponse(
        interests=interests, styles=styles, wants=wants, pace="relaxed" if "fast" not in styles and len(styles) <= 1 and not interests else "balanced",
        recommended_mode=recommended_mode_for(styles, req.mode), notes="Interpreted with deterministic rules.", engine="rule-based",  # type: ignore[arg-type]
        corridor_hints=known_corridor(req.origin, req.destination),
    )
    step_payload = {
        "origin": req.origin, "destination": req.destination, "start_time": fmt_clock(start_min), "end_time": fmt_clock(end_min),
        "travel_styles": styles, "interests": interests, "budget": req.budget,
        "allowed_styles": STYLES, "allowed_modes": ROUTE_MODES,
    }
    system = SYSTEM_RULES + (
        " Task (Journey Analyst): normalise the traveller's request. Return JSON: "
        '{"interests":[<=8 short lowercase phrases],"styles":[subset of allowed_styles],'
        '"wants":{"breakfast":bool,"lunch":bool,"dinner":bool},"pace":"relaxed|balanced|packed",'
        '"recommended_mode":one of allowed_modes,"notes":"one sentence on how you read the request",'
        '"corridor_hints":[up to 8 town names that typically lie on the road between origin and destination, in travel order]}. '
        "corridor_hints are only search hints and will be verified against Google Maps."
    )
    out = await get_groq().chat_json("Journey Analyst", system, step_payload, phase="analyze", max_tokens=500)
    if not out:
        return base
    try:
        llm_interests = [s.strip().lower()[:32] for s in out.get("interests", []) if isinstance(s, str) and s.strip()][:8]
        llm_styles = [canonical_style(s) for s in out.get("styles", []) if isinstance(s, str)]
        llm_styles = [s for s in llm_styles if s in STYLES]
        merged_interests = list(dict.fromkeys([*interests, *llm_interests]))[:8]
        merged_styles = list(dict.fromkeys([*styles, *llm_styles]))
        mode = out.get("recommended_mode")
        pace = out.get("pace") if out.get("pace") in ("relaxed", "balanced", "packed") else base.pace
        hints = [h.strip() for h in out.get("corridor_hints", []) if isinstance(h, str) and 2 < len(h.strip()) < 40][:8] or base.corridor_hints
        w = out.get("wants") if isinstance(out.get("wants"), dict) else {}
        wants2 = {k: bool(w.get(k, wants[k])) for k in wants}
        return AnalyzeResponse(
            interests=merged_interests, styles=merged_styles, wants=wants2, pace=pace,
            recommended_mode=req.mode or (mode if mode in ROUTE_MODES else base.recommended_mode),  # type: ignore[arg-type]
            notes=_clean_str(out.get("notes"), 200) or base.notes, engine="groq", corridor_hints=hints,
        )
    except Exception:
        return base


# ------------------------------------------------------------------------------------------------ 2. planner
@dataclass
class SearchPlanItem:
    anchor: int
    query: str
    purpose: str = ""


_STYLE_GROUPS: dict[str, tuple[str, list[str]]] = {
    "food": ("food", ["local restaurant dhaba", "cafe", "street food snacks"]),
    "culture": ("sight", ["heritage fort palace", "temple museum", "stepwell"]),
    "photography": ("scenic", ["viewpoint", "heritage monument"]),
    "scenic": ("scenic", ["viewpoint", "lake garden"]),
    "nature": ("nature", ["park garden lake", "wildlife sanctuary"]),
    "adventure": ("activity", ["adventure activities", "trekking"]),
}
_INTEREST_GROUPS: dict[str, tuple[str, str]] = {
    "street food": ("food", "street food snacks"), "architecture": ("sight", "fort palace haveli"),
    "hidden places": ("sight", "hidden gem offbeat attraction"), "music": ("activity", "live music venue"),
    "markets": ("sight", "local market bazaar"), "shopping": ("sight", "handicraft market"), "history": ("sight", "historical monument"),
}

KNOWN_CORRIDORS: dict[tuple[str, str], list[str]] = {
    ("delhi", "jaipur"): ["Gurugram", "Manesar", "Dharuhera", "Bawal", "Neemrana", "Behror", "Kotputli", "Shahpura", "Chandwaji"],
}


def known_corridor(origin: str, destination: str) -> list[str]:
    o, d = origin.strip().lower().split(",")[0], destination.strip().lower().split(",")[0]
    o = "delhi" if o == "new delhi" else o
    d = "delhi" if d == "new delhi" else d
    if (o, d) in KNOWN_CORRIDORS:
        return KNOWN_CORRIDORS[(o, d)]
    if (d, o) in KNOWN_CORRIDORS:
        return list(reversed(KNOWN_CORRIDORS[(d, o)]))
    return []


def query_groups(styles: list[str], interests: list[str], wants: dict[str, bool]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {}

    def add(g: str, q: str) -> None:
        lst = groups.setdefault(g, [])
        if q not in lst:
            lst.append(q)

    for i in interests:
        g, q = _INTEREST_GROUPS.get(i.lower(), ("sight", i.lower()))
        add(g, q)
    for s in styles:
        if s in _STYLE_GROUPS:
            g, qs = _STYLE_GROUPS[s]
            for q in qs:
                add(g, q)
    if wants.get("lunch") or wants.get("dinner") or not groups:
        add("food", "restaurant")
    if not styles and not interests:
        add("sight", "tourist attraction")
        add("scenic", "viewpoint")
        add("food", "cafe")
    return groups


def baseline_queries(styles: list[str], interests: list[str], wants: dict[str, bool]) -> list[str]:
    groups = query_groups(styles, interests, wants)
    out: list[str] = []
    depth = max((len(v) for v in groups.values()), default=0)
    for k in range(depth):  # interleave groups so a truncated list still covers every kind of experience
        for g in groups.values():
            if k < len(g) and g[k] not in out:
                out.append(g[k])
    return out


def baseline_plan(groups: dict[str, list[str]], anchors: list[dict[str, Any]], max_searches: int) -> list[SearchPlanItem]:
    """Every corridor segment gets one query per intent group (food / sights / views ...), varied along the route."""
    if not groups or not anchors:
        return []
    plan: list[SearchPlanItem] = []
    names = list(groups)
    for a in anchors:
        for gi, g in enumerate(names):
            qs = groups[g]
            plan.append(SearchPlanItem(a["idx"], qs[(a["idx"] + gi) % len(qs)], f"{g} near {a['name']}"))
            if a.get("is_destination") and len(qs) > 1:
                plan.append(SearchPlanItem(a["idx"], qs[(a["idx"] + gi + 1) % len(qs)], f"{g} near {a['name']}"))
    seen: set[tuple[int, str]] = set()
    uniq: list[SearchPlanItem] = []
    n = len(anchors)
    for p in sorted(plan, key=lambda p: 0 if anchors[min(p.anchor, n - 1)].get("is_destination") else 1):
        key = (p.anchor, p.query)
        if key not in seen:
            seen.add(key)
            uniq.append(p)
    if len(uniq) > max_searches:  # keep the destination, thin the corridor evenly
        dest = [p for p in uniq if anchors[min(p.anchor, n - 1)].get("is_destination")]
        rest = [p for p in uniq if p not in dest]
        room = max(0, max_searches - len(dest))
        step = len(rest) / room if room else 0
        rest = [rest[int(i * step)] for i in range(room)] if room else []
        uniq = dest + rest
    return uniq[:max_searches]


async def discovery_planner(styles: list[str], interests: list[str], wants: dict[str, bool], anchors: list[dict[str, Any]], max_searches: int, mode: str) -> tuple[list[SearchPlanItem], str]:
    base = baseline_plan(query_groups(styles, interests, wants), anchors, max_searches)
    system = SYSTEM_RULES + (
        " Task (Discovery Planner): decide which Google Maps searches to run along a road corridor. "
        'Return {"searches":[{"anchor":<index from anchors>,"query":"2-4 word Google Maps query","purpose":"why"}]}. '
        f"Use at most {max_searches} searches. Prefer diverse queries that serve the traveller's interests; "
        "put several on the destination anchor; avoid duplicates. Queries must be generic categories (e.g. 'heritage fort', 'dhaba'), never specific venue names."
    )
    payload = {"styles": styles, "interests": interests, "wants": wants, "mode": mode, "anchors": [{"anchor": a["idx"], "name": a["name"], "is_destination": bool(a.get("is_destination"))} for a in anchors]}
    out = await get_groq().chat_json("Discovery Planner", system, payload, phase="plan", max_tokens=700)
    if out and isinstance(out.get("searches"), list):
        valid: list[SearchPlanItem] = []
        for s in out["searches"]:
            try:
                a, q = int(s["anchor"]), _clean_str(s["query"], 40)
            except Exception:
                continue
            if q is None or not (0 <= a < len(anchors)) or re.search(r"\d{3,}", q):
                continue
            valid.append(SearchPlanItem(a, q, _clean_str(s.get("purpose"), 80) or ""))
        if len(valid) >= 4:
            merged: dict[tuple[int, str], SearchPlanItem] = {(p.anchor, p.query.lower()): p for p in valid}
            for p in base:  # make sure the deterministic coverage is still there if budget allows
                merged.setdefault((p.anchor, p.query.lower()), p)
            return list(merged.values())[:max_searches], "groq"
    return base, "rule-based"


# ------------------------------------------------------------------------------------------------ 3. curator
@dataclass
class CurationResult:
    pref_adjust: dict[str, float]
    roles: dict[str, str]
    one_liners: dict[str, str]
    engine: str = "rule-based"


async def experience_curator(candidates: list[dict[str, Any]], styles: list[str], interests: list[str], budget: str | None) -> CurationResult:
    """candidates: [{id,name,types,rating,reviews,role,snippets:[...]}] — snippets are real review text from SerpApi."""
    res = CurationResult({}, {}, {})
    if not candidates:
        return res
    system = SYSTEM_RULES + (
        " Task (Experience Curator): judge how well each candidate matches the traveller's styles/interests using ONLY its types, rating and review snippets. "
        'Return {"items":[{"id":str,"pref_adjust":number between -0.1 and 0.1,"role":one of allowed_roles,"one_liner":"<=18 words, no digits, grounded in the snippets"}]}. '
        "Do not mention opening hours, prices, distances or times."
    )
    payload = {"styles": styles, "interests": interests, "budget": budget, "allowed_roles": ROLES, "candidates": candidates}
    out = await get_groq().chat_json("Experience Curator", system, payload, phase="curate", max_tokens=1500)
    if not out or not isinstance(out.get("items"), list):
        return res
    ids = {c["id"] for c in candidates}
    for it in out["items"]:
        if not isinstance(it, dict) or it.get("id") not in ids:
            continue
        try:
            adj = float(it.get("pref_adjust", 0.0))
            res.pref_adjust[it["id"]] = max(-0.1, min(0.1, adj))
        except (TypeError, ValueError):
            pass
        if it.get("role") in ROLES:
            res.roles[it["id"]] = it["role"]
        line = _clean_str(it.get("one_liner"), 140)
        if line and not re.search(r"\d", line):
            res.one_liners[it["id"]] = line
    res.engine = "groq"
    return res


@dataclass
class NewsTriage:
    index: int
    kind: str  # closure | traffic | festival | event | other
    severity: str  # info | watch | warn
    affects: str
    note: str
    relevant: bool = True


_WARN_WORDS = ("closed", "shut down", "shut ", "curfew", "strike", "flood", "landslide", "blocked", "road closed", "fire")
_WATCH_WORDS = ("diversion", "resurfacing", "roadwork", "road work", "slow", "congestion", "jam", "crowd", "queue", "delay", "lane", "closure", "traffic", "protest", "accident")
_INFO_WORDS = ("festival", "fair", "concert", "celebration", "utsav", "mela", "carnival", "exhibition")


def _triage_rules(items: list[dict[str, Any]], context_tokens: list[str]) -> list[NewsTriage]:
    out: list[NewsTriage] = []
    for it in items:
        text = f"{it.get('title', '')} {it.get('snippet', '')}".lower()
        relevant = any(t in text for t in context_tokens)
        if not relevant:
            continue
        if any(w in text for w in _WARN_WORDS):
            kind, sev = "closure", "warn"
        elif any(w in text for w in _WATCH_WORDS):
            kind, sev = "traffic", "watch"
        elif any(w in text for w in _INFO_WORDS):
            kind, sev = "festival", "info"
        else:
            kind, sev = "other", "info"
        hit = next((t for t in context_tokens if t in text), "")
        out.append(NewsTriage(it["i"], kind, sev, hit.title(), str(it.get("title", ""))[:140]))
    return out


async def triage_news(items: list[dict[str, Any]], context_tokens: list[str], context: dict[str, Any]) -> tuple[list[NewsTriage], str]:
    if not items:
        return [], "rule-based"
    base = _triage_rules(items, context_tokens)
    system = SYSTEM_RULES + (
        " Task (constraint discovery): decide which news items could affect this journey. "
        'Return {"items":[{"i":index,"relevant":bool,"kind":"closure|traffic|festival|event|other","severity":"info|watch|warn",'
        '"affects":"area named in the item, or empty","note":"<=20 words restating the item"}]}. '
        "Only judge from the title/snippet/publisher/date provided. Do not trust sensational claims: use warn only for explicit closures/strikes/accidents."
    )
    out = await get_groq().chat_json("Experience Curator · news triage", system, {"context": context, "items": items}, phase="news", max_tokens=900)
    if out and isinstance(out.get("items"), list):
        valid_idx = {it["i"] for it in items}
        res: list[NewsTriage] = []
        for t in out["items"]:
            try:
                i = int(t["i"])
            except Exception:
                continue
            if i not in valid_idx or not t.get("relevant", True):
                continue
            kind = t.get("kind") if t.get("kind") in ("closure", "traffic", "festival", "event", "other") else "other"
            sev = t.get("severity") if t.get("severity") in ("info", "watch", "warn") else "info"
            res.append(NewsTriage(i, kind, sev, _clean_str(t.get("affects"), 60) or "", _clean_str(t.get("note"), 160) or ""))
        if res or not base:
            return res, "groq"
    return base, "rule-based"


# ------------------------------------------------------------------------------------------------ 8. narrator
def narrative_facts(journey: dict[str, Any]) -> dict[str, Any]:
    return journey


def rule_narrative(f: dict[str, Any]) -> Narrative:
    stops = f["stops"]
    n = len(stops)
    if n == 0:
        headline = f"A clean run from {f['origin']} to {f['destination']}"
        summary = (f"No stop beats its detour cost for this style of trip, so the route stays direct: leave at {f['start']} and arrive around {f['arrive']}. "
                   f"Try Experience or Discovery mode to see what is worth a detour.")
        return Narrative(headline=headline, summary=summary, highlights=[], engine="rule-based")
    names = ", ".join(s["name"] for s in stops[:3]) + ("…" if n > 3 else "")
    headline = f"{n} experience{'s' if n != 1 else ''} worth stopping for on the way to {f['destination']}"
    summary = (
        f"Leave {f['origin']} at {f['start']} and reach {f['destination']} around {f['arrive']}. Your living route stops at {names}, "
        f"each validated against its opening window at the time you will actually be there. Total detour: {f['detour']} min on top of a {f['direct']} drive."
    )
    highlights = [f"{s['arrival']} · {s['name']} — {s['top_reason']}" for s in stops]
    return Narrative(headline=headline, summary=summary, highlights=highlights, engine="rule-based")


async def trip_narrator(facts: dict[str, Any]) -> Narrative:
    base = rule_narrative(facts)
    if not facts["stops"]:
        return base
    system = SYSTEM_RULES + (
        " Task (Trip Narrator): write an upbeat, concrete explanation of the planned route for a traveller. "
        'Return {"headline":"<=12 words","summary":"2-3 sentences","highlights":["one short line per stop, in order"]}. '
        "Mention only stops, times and numbers present in the facts. Do not add new facts. Avoid generic phrases like 'AI-powered assistant'."
    )
    out = await get_groq().chat_json("Trip Narrator", system, facts, phase="narrate", max_tokens=700)
    if not out:
        return base
    headline, summary = _clean_str(out.get("headline"), 120), _clean_str(out.get("summary"), 600)
    highlights = [h for h in (_clean_str(x, 200) for x in out.get("highlights", []) if isinstance(x, str)) if h][: len(facts["stops"])]
    if not headline or not summary:
        return base
    blob = json.dumps(facts, ensure_ascii=False)
    if not all(numbers_grounded(t, blob) for t in [headline, summary, *highlights]):
        return base  # LLM produced a number that is not in the evidence — discard
    names = {s["name"].lower() for s in facts["stops"]}
    if len(highlights) != len(facts["stops"]) or not any(nm in summary.lower() or nm in " ".join(highlights).lower() for nm in names):
        highlights = base.highlights
    return Narrative(headline=headline, summary=summary, highlights=highlights, engine="groq")


# ------------------------------------------------------------------------------------------------ 6/7. explainers
async def explain_stress(facts: dict[str, Any], fallback: str) -> tuple[str, str]:
    system = SYSTEM_RULES + (
        " Task (Stress Tester): explain in 2-3 plain sentences what this SIMULATED disruption does to the plan. "
        'Return {"explanation":"..."}. Say "simulated" or "if" — never present the scenario as having happened. Use only facts provided.'
    )
    out = await get_groq().chat_json("Stress Tester", system, facts, phase="stress", max_tokens=350)
    text = _clean_str((out or {}).get("explanation"), 520)
    if text and numbers_grounded(text, facts):
        return text, "groq"
    return fallback, "rule-based"


async def explain_recovery(facts: dict[str, Any], fallback: str) -> tuple[str, str]:
    system = SYSTEM_RULES + (
        " Task (Recovery Planner): the backend already validated the replacement(s). Explain in 2-3 sentences why each change was made and what is preserved. "
        'Return {"explanation":"..."}. Use only facts provided.'
    )
    out = await get_groq().chat_json("Recovery Planner", system, facts, phase="repair", max_tokens=380)
    text = _clean_str((out or {}).get("explanation"), 560)
    if text and numbers_grounded(text, facts):
        return text, "groq"
    return fallback, "rule-based"
