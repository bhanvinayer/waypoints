"""SerpApi JSON -> graph nodes, evidence and signals.

Anything we assert about the world is created here from an *observed* field, together with an Evidence record that
says which engine returned it. Nothing in this module invents data.
"""
from __future__ import annotations

import re
from typing import Any

from ..schemas import (
    CurrentSignal, EventInfo, Evidence, ExperienceNode, ExperienceWindow, ReviewSignal,
)
from ..trace import now_iso
from .parsing import (
    ROLE_LABEL, ROLE_VISIT_MINUTES, classify_role, distance_to_km, duration_to_minutes, is_experience, parse_duration_text,
    parse_operating_hours, parse_price, stable_id,
)


def _gps(r: dict[str, Any]) -> tuple[float, float] | None:
    g = r.get("gps_coordinates") or {}
    try:
        return float(g["latitude"]), float(g["longitude"])
    except (KeyError, TypeError, ValueError):
        return None


def _thumb(r: dict[str, Any]) -> str | None:
    if r.get("thumbnail"):
        return r["thumbnail"]
    imgs = r.get("images")
    if isinstance(imgs, list) and imgs and isinstance(imgs[0], dict):
        return imgs[0].get("thumbnail") or imgs[0].get("image")
    return None


def _desc(r: dict[str, Any]) -> str | None:
    if r.get("description"):
        return r["description"]
    es = r.get("editorial_summary")
    return es.get("snippet") if isinstance(es, dict) else None


def _time_spent(r: dict[str, Any]) -> Any:
    if r.get("time_spent"):
        return r["time_spent"]
    pt = r.get("popular_times")
    return pt.get("time_spent") if isinstance(pt, dict) else None


def source_key(r: dict[str, Any]) -> str:
    return str(r.get("place_id") or r.get("data_id") or f"{r.get('title')}|{r.get('address')}|{_gps(r)}")


def node_from_local_result(r: dict[str, Any], mode: str = "live") -> ExperienceNode | None:
    """One google_maps `local_results` / `place_results` entry -> ExperienceNode (None when not an experience)."""
    g = _gps(r)
    title = r.get("title")
    if not g or not title:
        return None
    types = [t for t in (r.get("types") or [r.get("type")]) if t]
    if not is_experience(title, [str(t) for t in types]):
        return None
    state_text = " ".join(str(r.get(k, "")) for k in ("hours", "open_state")).lower()
    if r.get("permanently_closed") or "permanently closed" in state_text:
        return None
    role = classify_role(title, [str(t) for t in types], r.get("description"))
    price_level, price_text = parse_price(r.get("price"))
    intervals, hours_text = parse_operating_hours(r.get("operating_hours"))
    hours_known = bool(hours_text)
    node = ExperienceNode(
        id=stable_id(source_key(r)),
        source_id=source_key(r),
        data_id=r.get("data_id"),
        place_id=r.get("place_id"),
        name=str(title),
        latitude=g[0],
        longitude=g[1],
        address=r.get("address"),
        thumbnail=_thumb(r),
        link=r.get("website") or r.get("link"),
        description=_desc(r),
        category=[str(t) for t in types][:3] or [ROLE_LABEL[role]],
        role=role,  # type: ignore[arg-type]
        rating=float(r["rating"]) if r.get("rating") not in (None, "") else None,
        review_count=_to_int(r.get("reviews")),
        price_level=price_level,
        price_text=price_text,
        opening_hours=intervals,
        hours_known=hours_known,
        hours_text=hours_text,
        open_state=r.get("open_state") or (r.get("hours") if isinstance(r.get("hours"), str) else None),
        estimated_visit_minutes=ROLE_VISIT_MINUTES[role],
        visit_minutes_source="inferred",
    )
    mins = parse_duration_text(_time_spent(r))
    if mins:
        node.estimated_visit_minutes = max(15, min(240, mins))
        node.visit_minutes_source = "observed"
    node.hidden_gem = bool(node.rating and node.rating >= 4.3 and node.review_count and 30 <= node.review_count <= 7000)
    node.evidence.append(maps_evidence(node, mode))
    return node


def _to_int(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        if isinstance(v, str):
            s = v.strip().lower().replace(",", "")
            if s.endswith("k"):
                return int(float(s[:-1]) * 1000)
            return int(float(s))
        return int(v)
    except (ValueError, TypeError):
        return None


def maps_evidence(node: ExperienceNode, mode: str = "live") -> Evidence:
    bits = []
    if node.rating:
        bits.append(f"{node.rating:.1f}★" + (f" from {node.review_count:,} reviews" if node.review_count else ""))
    if node.category:
        bits.append(", ".join(node.category[:2]))
    if node.address:
        bits.append(node.address)
    if node.open_state:
        bits.append(node.open_state)
    return Evidence(
        id=f"ev_{node.id}_maps", kind="maps", title="Google Maps listing", detail=" · ".join(bits) or "Listing found", source="google_maps",
        provenance="observed", node_id=node.id, retrieved_at=now_iso(), mode=mode,  # type: ignore[arg-type]
        url=node.link,
    )


def merge_place_details(node: ExperienceNode, data: dict[str, Any], mode: str = "live") -> bool:
    """Enrich a node with `google_maps` type=place output (opening hours, time spent, description)."""
    pr = data.get("place_results") if isinstance(data, dict) else None
    if not pr:
        return False
    raw_hours = pr.get("operating_hours") or pr.get("hours")
    if isinstance(raw_hours, (dict, list)):
        intervals, texts = parse_operating_hours(raw_hours)
        if texts:
            node.opening_hours = intervals
            node.hours_text = texts
            node.hours_known = True
    mins = parse_duration_text(_time_spent(pr))
    if mins:
        node.estimated_visit_minutes = max(15, min(240, mins))
        node.visit_minutes_source = "observed"
    if pr.get("description") and not node.description:
        node.description = pr["description"]
    if pr.get("thumbnail") and not node.thumbnail:
        node.thumbnail = pr["thumbnail"]
    if pr.get("website"):
        node.link = pr["website"]
    if node.hours_known:
        today = next(iter(node.hours_text.items()))
        node.evidence.append(Evidence(
            id=f"ev_{node.id}_hours", kind="maps", title="Opening hours (Google Maps place details)",
            detail="; ".join(f"{d[:3].title()}: {t}" for d, t in node.hours_text.items()), source="google_maps",
            provenance="observed", node_id=node.id, retrieved_at=now_iso(), mode=mode,  # type: ignore[arg-type]
        ))
    return True


# ------------------------------------------------------------------------- reviews
_THEMES: list[tuple[str, str, str, tuple[str, ...]]] = [
    ("sunset views", "positive", "sunset", ("sunset", "golden hour", "golden-hour")),
    ("photogenic", "positive", "photo", ("photo", "photograph", "instagram", "photogenic", "picturesque")),
    ("crowds & queues", "negative", "crowd", ("crowd", "queue", "line ", "rush", "busy", "sell out", "sells out", "sold out")),
    ("go early / timing", "neutral", "timing", ("go early", "go before", "arrive early", "closes", "closing", "kitchen closes", "opens late", "before noon", "early morning")),
    ("pricey", "negative", "price", ("pricey", "expensive", "overpriced", "ticket", "entry fee")),
    ("loved by visitors", "positive", "love", ("worth", "must", "best", "amazing", "stunning", "spectacular", "fantastic", "excellent", "superb", "legendary", "magical", "beautiful", "lovely")),
    ("clean & easy", "positive", "clean", ("clean", "quick service", "friendly")),
]


def review_signals(reviews: list[dict[str, Any]], limit: int = 4) -> list[ReviewSignal]:
    out: list[ReviewSignal] = []
    seen: set[str] = set()
    for rv in reviews:
        text = (rv.get("snippet") or rv.get("text") or "").strip()
        if not text:
            continue
        low = text.lower()
        for theme, sentiment, _, kws in _THEMES:
            if theme in seen:
                continue
            if any(k in low for k in kws):
                seen.add(theme)
                out.append(ReviewSignal(
                    theme=theme, sentiment=sentiment,  # type: ignore[arg-type]
                    snippet=text if len(text) <= 180 else text[:177].rsplit(" ", 1)[0] + "…",
                    rating=rv.get("rating"), date=rv.get("iso_date") or rv.get("date"),
                ))
                break
        if len(out) >= limit:
            break
    return out


def detect_sunset_sensitive(node: ExperienceNode, reviews: list[dict[str, Any]]) -> bool:
    """OBSERVED when review text / description / listing mention sunset; never assumed."""
    mentions = sum(1 for r in reviews if any(k in str(r.get("snippet", "")).lower() for k in ("sunset", "golden hour")))
    declared = "sunset" in (node.description or "").lower() or "sunset" in node.name.lower()
    return (declared or mentions >= 2) and node.role in ("viewpoint", "heritage", "nature", "religious", "other", "activity", "market")


def apply_reviews(node: ExperienceNode, data: dict[str, Any], mode: str = "live") -> None:
    reviews = data.get("reviews") or []
    node.reviews = review_signals(reviews)
    if detect_sunset_sensitive(node, reviews):
        node.sunset_sensitive = True
        if "Sunset viewpoint" not in node.category:
            node.category.append("Sunset viewpoint")
    for i, sig in enumerate(node.reviews[:3]):
        node.evidence.append(Evidence(
            id=f"ev_{node.id}_rev{i}", kind="reviews", title=f"Review signal: {sig.theme}", detail=f"“{sig.snippet}”" + (f" — {sig.rating:.0f}★" if sig.rating else ""),
            source="google_maps_reviews", provenance="observed", node_id=node.id, date=sig.date, retrieved_at=now_iso(), mode=mode,  # type: ignore[arg-type]
        ))


# ------------------------------------------------------------------------- web / events / news
def apply_web(node: ExperienceNode, data: dict[str, Any], mode: str = "live", limit: int = 2) -> int:
    n = 0
    for i, r in enumerate((data.get("organic_results") or [])[:limit]):
        if not r.get("title") or not r.get("link"):
            continue
        node.evidence.append(Evidence(
            id=f"ev_{node.id}_web{i}", kind="search", title=r["title"], detail=r.get("snippet", ""), source="google",
            provenance="observed", url=r["link"], publisher=r.get("displayed_link") or r.get("source"), date=r.get("date"),
            node_id=node.id, retrieved_at=now_iso(), mode=mode,  # type: ignore[arg-type]
        ))
        n += 1
    return n


def event_node(ev: EventInfo, venue: ExperienceNode, mode: str = "live") -> ExperienceNode | None:
    if ev.start_min is None:
        return None
    end = ev.end_min or ev.start_min + 120
    node = ExperienceNode(
        id=stable_id(f"event|{ev.title}|{venue.id}"),
        source_id=f"event|{ev.title}",
        name=ev.title,
        kind="event",
        latitude=venue.latitude,
        longitude=venue.longitude,
        address=ev.address or venue.address,
        thumbnail=ev.thumbnail,
        link=ev.link,
        description=f"Live at {ev.venue or venue.name}",
        category=["Live event", *venue.category[:1]],
        role="event",
        rating=venue.rating,
        review_count=venue.review_count,
        price_level=venue.price_level,
        hours_known=True,
        estimated_visit_minutes=60 if end - ev.start_min >= 240 else max(45, min(120, end - ev.start_min)),  # all-day markets: an hour, not the whole day
        visit_minutes_source="inferred",
        windows=[ExperienceWindow(kind="event", start_min=ev.start_min, end_min=end, label=ev.when_text or ev.title, evidence_id=f"ev_{stable_id('event|' + ev.title + '|' + venue.id)}_event")],
        events=[ev],
    )
    node.hidden_gem = False
    node.evidence.append(Evidence(
        id=f"ev_{node.id}_event", kind="event", title=ev.title, detail=f"{ev.when_text or ''} · {ev.venue or venue.name}".strip(" ·"),
        source="google_events", provenance="observed", url=ev.link, date=ev.when_text, node_id=node.id, retrieved_at=now_iso(), mode=mode,  # type: ignore[arg-type]
    ))
    node.evidence.append(maps_evidence(venue, mode).model_copy(update={"id": f"ev_{node.id}_venue", "node_id": node.id, "title": "Venue on Google Maps"}))
    node.current_signals.append(CurrentSignal(
        id=f"sig_{node.id}", kind="event", title=ev.title, detail=ev.when_text or "", severity="info", evidence_id=f"ev_{node.id}_event",
        start_min=ev.start_min, end_min=end, provenance="observed",
    ))
    return node


def parse_directions(data: dict[str, Any]) -> dict[str, Any] | None:
    dirs = data.get("directions") or []
    if not dirs:
        return None
    d0 = dirs[0]
    dist = distance_to_km(d0.get("distance") if d0.get("distance") is not None else d0.get("formatted_distance"))
    dur = duration_to_minutes(d0.get("duration") if d0.get("duration") is not None else d0.get("formatted_duration"))
    pts = extract_points(d0)
    places = []
    for p in data.get("places_info") or []:
        g = _gps(p)
        if g:
            places.append({"lat": g[0], "lon": g[1], "address": p.get("address")})
    return {"distance_km": dist, "duration_min": dur, "points": pts, "via": d0.get("via"), "places": places}


def extract_points(obj: Any) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []

    def walk(o: Any) -> None:
        if isinstance(o, dict):
            g = o.get("gps_coordinates")
            if isinstance(g, dict) and "latitude" in g and "longitude" in g:
                try:
                    pt = (float(g["latitude"]), float(g["longitude"]))
                    if not out or out[-1] != pt:
                        out.append(pt)
                except (TypeError, ValueError):
                    pass
            for v in o.values():
                if isinstance(v, (dict, list)):
                    walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(obj)
    return out
