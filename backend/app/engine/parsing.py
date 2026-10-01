"""Tolerant parsers for the semi-structured strings SerpApi returns (hours, prices, durations, events)."""
from __future__ import annotations

import hashlib
import re
from datetime import date, datetime
from typing import Any, Iterable

from ..schemas import EventInfo, OpeningInterval

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_TOKEN = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?")


def _norm(text: str) -> str:
    t = text.replace(" ", " ").replace(" ", " ").replace(" ", " ")
    t = re.sub(r"[‒–—―−]", "-", t)
    t = re.sub(r"\s+to\s+", "-", t, flags=re.I)
    return t.strip().lower()


def _to_min(hour: int, minute: int, suffix: str | None) -> int:
    if suffix == "pm" and hour < 12:
        hour += 12
    elif suffix == "am" and hour == 12:
        hour = 0
    return hour * 60 + minute


def parse_range(text: str) -> tuple[int, int] | None:
    t = _norm(text)
    if "-" not in t:
        return None
    left, right = t.split("-", 1)
    ml, mr = _TOKEN.search(left), _TOKEN.search(right)
    if not ml or not mr:
        return None
    lh, lm, ls = int(ml.group(1)), int(ml.group(2) or 0), ml.group(3)
    rh, rm, rs = int(mr.group(1)), int(mr.group(2) or 0), mr.group(3)
    if rs is None and ls is None:
        open_m, close_m = _to_min(lh, lm, None), _to_min(rh, rm, None)
    else:
        close_m = _to_min(rh, rm, rs or ls)
        if ls:
            open_m = _to_min(lh, lm, ls)
        else:
            open_m = _to_min(lh, lm, rs)
            if open_m >= close_m and rs:  # "11-2 pm" -> 11 am - 2 pm
                open_m = _to_min(lh, lm, "am" if rs == "pm" else "pm")
    if close_m <= open_m:
        close_m += 1440  # overnight (e.g. 6 pm - 2 am) or midnight close
    return open_m, close_m


def parse_day_hours(text: str | None) -> list[tuple[int, int]] | None:
    """None -> unknown. [] -> closed. Otherwise list of (open, close) minute tuples."""
    if text is None:
        return None
    t = _norm(str(text))
    if not t:
        return None
    if "closed" in t and not re.search(r"\d", t):
        return []
    if "24 hours" in t or "24 hrs" in t or "24/7" in t or "open 24" in t:
        return [(0, 1440)]
    out: list[tuple[int, int]] = []
    for part in re.split(r",|;|&", t):
        r = parse_range(part)
        if r:
            out.append(r)
    return out or None


def parse_operating_hours(raw: Any) -> tuple[list[OpeningInterval], dict[str, str]]:
    """Accepts SerpApi's {"monday": "10 am-6 pm", ...} or a list of such single-key dicts."""
    pairs: list[tuple[str, str]] = []
    if isinstance(raw, dict):
        pairs = [(str(k).lower(), str(v)) for k, v in raw.items()]
    elif isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                pairs.extend((str(k).lower(), str(v)) for k, v in item.items())
    intervals: list[OpeningInterval] = []
    texts: dict[str, str] = {}
    for day_name, text in pairs:
        if day_name not in DAYS:
            continue
        texts[day_name] = text.replace(" ", " ").replace(" ", " ")
        parsed = parse_day_hours(text)
        for o, c in parsed or []:
            intervals.append(OpeningInterval(day=DAYS.index(day_name), open_min=o, close_min=c))
    return intervals, texts


def intervals_for_date(intervals: Iterable[OpeningInterval], d: date) -> list[tuple[int, int]]:
    """Open intervals (in minutes from midnight of date d), including overnight spill from the previous day."""
    wd, prev = d.weekday(), (d.weekday() - 1) % 7
    out: list[tuple[int, int]] = []
    for iv in intervals:
        if iv.day == wd:
            out.append((iv.open_min, iv.close_min))
        if iv.day == prev and iv.close_min > 1440:
            out.append((0, iv.close_min - 1440))
    out.sort()
    merged: list[tuple[int, int]] = []
    for o, c in out:
        if merged and o <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], c))
        else:
            merged.append((o, c))
    return merged


# ----------------------------------------------------------------- price / duration
def parse_price(value: Any) -> tuple[int | None, str | None]:
    if value is None:
        return None, None
    text = str(value).strip()
    if not text:
        return None, None
    sym = re.fullmatch(r"[₹$€£¥]{1,4}", text)
    if sym:
        return len(text), text
    nums = [float(n.replace(",", "")) for n in re.findall(r"\d[\d,]*\.?\d*", text)]
    if nums:
        mid = sum(nums[:2]) / len(nums[:2])
        if "$" in text:
            mid *= 83
        level = 1 if mid <= 250 else 2 if mid <= 800 else 3 if mid <= 2000 else 4
        return level, text
    return None, text


def parse_budget(budget: str | None) -> int | None:
    if not budget:
        return None
    b = budget.strip()
    if re.fullmatch(r"[₹$]{1,4}", b):
        return len(b)
    digits = re.findall(r"\d", b)
    if digits:
        return max(1, min(4, int(digits[0])))
    return {"budget": 1, "cheap": 1, "moderate": 2, "mid": 2, "premium": 3, "luxury": 4}.get(b.lower())


def parse_duration_text(text: Any) -> int | None:
    """'People typically spend 1 hr 30 min here' / '1 to 2 hr' / '45 min to 1 hr' / '1.5 hr' / '45 min' -> minutes."""
    if not text:
        return None
    t = str(text).lower().replace("–", "-").replace("—", "-")
    t = re.sub(r"\s+to\s+", "-", t)
    unit = r"(hr|hrs|hour|hours|h|min|mins|minutes|m)(?![a-z])"
    rng = re.search(rf"(\d+(?:\.\d+)?)\s*(?:{unit})?\s*-\s*(\d+(?:\.\d+)?)\s*{unit}", t)
    if rng:
        u1, u2 = rng.group(2), rng.group(4)
        lo_unit = u1 or u2
        lo = float(rng.group(1)) * (60 if lo_unit.startswith("h") else 1)
        hi = float(rng.group(3)) * (60 if u2.startswith("h") else 1)
        return int(round((lo + hi) / 2 / 5) * 5)
    total, found = 0.0, False
    for m in re.finditer(rf"(\d+(?:\.\d+)?)\s*{unit}", t):
        found = True
        val = float(m.group(1))
        total += val * 60 if m.group(2).startswith("h") else val
    return int(round(total)) if found and total > 0 else None


def duration_to_minutes(value: Any) -> float | None:
    """SerpApi directions durations: seconds (int) or text ('4 hr 51 min')."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) / 60.0
    return parse_duration_text(value)


def distance_to_km(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) / 1000.0
    m = re.search(r"([\d,]+(?:\.\d+)?)\s*(km|mi|m)\b", str(value).lower())
    if not m:
        return None
    v = float(m.group(1).replace(",", ""))
    return v * 1.609 if m.group(2) == "mi" else v / 1000 if m.group(2) == "m" else v


# ----------------------------------------------------------------- classification
_ROLE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("nightlife", ("night club", "nightclub", " pub ", " bar ", "lounge", "live music venue", "brewery")),
    ("viewpoint", ("viewpoint", "view point", "sunset point", "lookout", "observation", "scenic spot", "hilltop", "hill top")),
    ("museum", ("museum", "art gallery", "gallery", "science centre", "cultural centre", "kala kendra")),
    ("religious", ("temple", "mandir", "gurudwara", "gurdwara", "masjid", "mosque", "church", "dargah", "shrine", "ashram")),
    ("heritage", ("fort", "palace", "haveli", "heritage", "monument", "stepwell", "baori", "historical", "mahal", "tomb", "ruins", "archaeological", "memorial", "gate", "observatory", "jantar")),
    ("activity", ("adventure", "zipline", "amusement", "water park", "go kart", "theme park", "kingdom of dreams", " show ", "village resort", "entertainment")),
    ("nature", ("park", "garden", "lake", "sanctuary", "wildlife", "waterfall", "nature", "reserve", "trek", "forest", " dam ")),
    ("market", ("market", "bazaar", "bazar", "shopping", "emporium", "handicraft", "chowk", " mall ")),
    ("snack", ("cafe", "café", "coffee", "tea ", "chai", "sweet", "mithai", "bakery", "street food", "chaat", "kachori", "lassi", "juice", "ice cream", "dessert", "snack", "tapri", "bhandar", "bhandaar")),
    ("meal", ("restaurant", "dhaba", "thali", "eatery", "bhojnalaya", "biryani", "kitchen", "dining", "food court", "bhojanalay", "bistro", "diner", "rasoi")),
]

ROLE_VISIT_MINUTES = {
    "meal": 60, "snack": 30, "heritage": 75, "museum": 75, "viewpoint": 30, "nature": 50,
    "market": 45, "religious": 30, "nightlife": 90, "activity": 90, "event": 90, "other": 45,
}

ROLE_LABEL = {
    "meal": "Meal", "snack": "Snack & café", "heritage": "Heritage", "museum": "Museum", "viewpoint": "Viewpoint",
    "nature": "Nature", "market": "Market", "event": "Live event", "nightlife": "Nightlife",
    "religious": "Spiritual", "activity": "Activity", "other": "Stop",
}

_EXCLUDE = (
    "gas station", "petrol", "fuel", "atm", "bank", "hospital", "clinic", "school", "college", "university",
    "police", "toll plaza", "bus stand", "railway station", "car repair", "tyre", "garage", "pharmacy",
    "real estate", "builder", "insurance", "salon", "gym", "courier", "warehouse", "factory",
)


def _match_role(text: str) -> str | None:
    hay = " " + text.lower() + " "
    for role, kws in _ROLE_RULES:
        if any(kw in hay for kw in kws):
            return role
    return None


def classify_role(name: str, types: list[str], description: str | None = None) -> str:
    """Primary Google Maps type wins (LMB = 'Restaurant' first, 'Sweet shop' second), then the name, then the description."""
    for t in types:
        r = _match_role(str(t))
        if r:
            return r
    r = _match_role(name)
    if r:
        return r
    if description:
        r = _match_role(description)
        if r:
            return r
    return "other"


def is_experience(name: str, types: list[str]) -> bool:
    hay = " ".join([name, *types]).lower()
    return not any(x in hay for x in _EXCLUDE)


def stable_id(source: str) -> str:
    return "p_" + hashlib.sha1(source.encode("utf-8")).hexdigest()[:10]


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def normalise_name(name: str) -> str:
    n = re.sub(r"[^a-z0-9 ]+", " ", name.lower())
    n = re.sub(r"\b(the|and|of|in|at|restaurant|hotel)\b", " ", n)
    return re.sub(r"\s+", " ", n).strip()


# ----------------------------------------------------------------- events
_RANGE = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)", re.I)
_SINGLE = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", re.I)


def parse_event_times(when: str | None) -> tuple[int | None, int | None]:
    if not when:
        return None, None
    t = _norm(when)
    m = _RANGE.search(t)
    if m:
        lh, lm, ls, rh, rm, rs = int(m.group(1)), int(m.group(2) or 0), m.group(3), int(m.group(4)), int(m.group(5) or 0), m.group(6)
        end = _to_min(rh, rm, rs)
        start = _to_min(lh, lm, ls or rs)
        if start >= end and not ls:
            start = _to_min(lh, lm, "am" if rs == "pm" else "pm")
        if end <= start:
            end += 1440
        return start, end
    s = _SINGLE.search(t)
    if s:
        start = _to_min(int(s.group(1)), int(s.group(2) or 0), s.group(3))
        return start, start + 120
    return None, None


def event_matches_date(ev: dict[str, Any], d: date) -> bool | None:
    """True/False if the event's reported date can be compared with d, None if unknown."""
    start = ((ev.get("date") or {}).get("start_date") or "").strip()
    if not start:
        return None
    for fmt in ("%b %d %Y", "%B %d %Y"):
        try:
            return datetime.strptime(f"{start} {d.year}", fmt).date() == d
        except ValueError:
            continue
    return None


def parse_event(ev: dict[str, Any], d: date) -> EventInfo | None:
    match = event_matches_date(ev, d)
    if match is False:
        return None
    when = (ev.get("date") or {}).get("when") or ""
    start, end = parse_event_times(when)
    venue = (ev.get("venue") or {}).get("name") if isinstance(ev.get("venue"), dict) else None
    addr = ev.get("address")
    addr_text = ", ".join(addr) if isinstance(addr, list) else (addr if isinstance(addr, str) else None)
    return EventInfo(
        title=str(ev.get("title") or "Event"),
        start_min=start,
        end_min=end,
        when_text=when or None,
        venue=venue,
        address=addr_text,
        link=ev.get("link"),
        thumbnail=ev.get("thumbnail"),
    )
