from __future__ import annotations

import re
from datetime import date, datetime, timedelta

_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
DAY_MIN = 1440


def parse_clock(text: str | int | None, default: int | None = None) -> int:
    """'8:00 AM' | '08:00' | '20:30' | '8pm' -> minutes after midnight."""
    if isinstance(text, int):
        return text
    if text is None or not str(text).strip():
        if default is None:
            raise ValueError("empty clock value")
        return default
    s = str(text).strip().lower().replace(".", "")
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$", s)
    if not m:
        if default is not None:
            return default
        raise ValueError(f"cannot parse time {text!r}")
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    if h > 29 or mi > 59:
        if default is not None:
            return default
        raise ValueError(f"cannot parse time {text!r}")
    return h * 60 + mi


def fmt_clock(minute: float | int | None, with_day: bool = False) -> str:
    if minute is None:
        return "—"
    m = int(round(minute))
    day_shift = m // DAY_MIN
    m = m % DAY_MIN
    h, mi = divmod(m, 60)
    ap = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    out = f"{h12}:{mi:02d} {ap}"
    if with_day and day_shift:
        out += f" (+{day_shift}d)"
    return out


def fmt_duration(minutes: float | int) -> str:
    m = int(round(minutes))
    if m < 60:
        return f"{m} min"
    h, mi = divmod(m, 60)
    return f"{h}h {mi:02d}m" if mi else f"{h}h"


def resolve_date(value: str | None, today: date | None = None) -> date:
    """ISO date, 'today', 'tomorrow' or a weekday name (next occurrence, including today)."""
    today = today or date.today()
    if not value:
        return today
    v = value.strip().lower()
    if v == "today":
        return today
    if v == "tomorrow":
        return today + timedelta(days=1)
    if v in _WEEKDAYS:
        delta = (_WEEKDAYS.index(v) - today.weekday()) % 7
        return today + timedelta(days=delta)
    try:
        return datetime.fromisoformat(v).date()
    except ValueError:
        pass
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%b %d %Y", "%B %d %Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
    raise ValueError(f"cannot understand date {value!r}")


def weekday_name(d: date) -> str:
    return _WEEKDAYS[d.weekday()]
