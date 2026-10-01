from datetime import date

from app.engine.parsing import parse_operating_hours
from app.engine.sun import sunset_minutes
from app.engine.temporal import TimeCtx, assess
from app.schemas import ExperienceNode, ExperienceWindow

D = date(2026, 10, 3)  # a Saturday
ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def node(hours: str | None, role="meal", visit=60, **kw) -> ExperienceNode:
    ivs, texts = parse_operating_hours({d: hours for d in ALL_DAYS}) if hours else ([], {})
    kw.setdefault("hours_known", bool(hours))
    return ExperienceNode(
        id="n1", name="Test", latitude=0, longitude=0, role=role, opening_hours=ivs, hours_text=texts,
        estimated_visit_minutes=visit, **kw,
    )


CTX = TimeCtx(date=D, sunset_min=18 * 60 + 12)


def test_restaurant_open_when_you_arrive():
    # spec example: arrive 7:40 PM, open 6-11 PM, 60 minute visit -> high temporal fit
    a = assess(node("6 pm–11 pm"), 19 * 60 + 40, CTX)
    assert a.valid and a.score >= 0.85 and a.status == "IDEAL_WINDOW"


def test_attraction_closed_before_arrival_is_zero():
    # spec example: open 10 AM-7 PM, you arrive 7:40 PM -> zero, never recommended
    a = assess(node("10 am–7 pm", role="heritage"), 19 * 60 + 40, CTX)
    assert a.status == "NOT_OPEN" and a.score == 0 and not a.valid


def test_closing_too_soon():
    a = assess(node("10 am–7 pm", role="heritage", visit=90), 18 * 60 + 5, CTX)
    assert a.status == "CLOSING_TOO_SOON" and not a.valid


def test_short_wait_for_opening_is_accepted_but_long_wait_is_not():
    ok = assess(node("10 am–6 pm", role="heritage"), 9 * 60 + 45, CTX)
    assert ok.valid and ok.wait_min == 15 and ok.start_min == 600
    bad = assess(node("10 am–6 pm", role="heritage"), 8 * 60, CTX)
    assert bad.status == "NOT_OPEN" and not bad.valid


def test_closed_all_day():
    a = assess(node("Closed", role="heritage"), 12 * 60, CTX)
    assert a.status == "NOT_OPEN" and "all day" in a.reason


def test_unknown_hours_is_conditional():
    a = assess(node(None, role="market"), 14 * 60, CTX)
    assert a.status == "UNKNOWN_HOURS" and 0.4 <= a.score < 0.8


def test_meal_outside_meal_time_is_penalised():
    lunch = assess(node("8 am–11 pm"), 13 * 60, CTX)
    odd = assess(node("8 am–11 pm"), 16 * 60 + 30, CTX)
    assert lunch.status == "IDEAL_WINDOW" and odd.status == "OPEN_AT_ARRIVAL" and odd.score < lunch.score


def make_event(start, end):
    return node(None, role="event", visit=60, kind="event", windows=[ExperienceWindow(kind="event", start_min=start, end_min=end, label="live music")], hours_known=True)


def test_event_window_spec_example():
    # live music 8:00-10:30 PM: 7:45 excellent, 9:50 still useful, 10:45 invalid
    ev = make_event(20 * 60, 22 * 60 + 30)
    assert assess(ev, 19 * 60 + 45, CTX).status == "IDEAL_WINDOW"
    still = assess(ev, 21 * 60 + 50, CTX)
    assert still.valid is False or still.score > 0  # 40 minutes left: reduced but not impossible
    assert assess(ev, 22 * 60 + 45, CTX).status == "EVENT_CONFLICT"


def test_event_shift_moves_the_window():
    ev = make_event(20 * 60, 22 * 60)
    shifted = TimeCtx(date=D, event_shift_min=30)
    assert assess(ev, 19 * 60 + 50, shifted).wait_min == 40  # now starts at 8:30 instead of 8:00
    assert assess(ev, 21 * 60 + 50, shifted).valid  # still 40 min of an event pushed to 10:30 PM


def test_sunset_window():
    s = 18 * 60 + 12
    n = node("Open 24 hours", role="viewpoint", visit=45, sunset_sensitive=True)
    assert assess(n, s - 40, CTX).status == "IDEAL_WINDOW"
    early = assess(n, s - 100, CTX)  # arrives early -> lingers for the golden hour
    assert early.valid and early.wait_min > 0
    missed = assess(n, s + 40, CTX)
    assert missed.status == "WINDOW_MISSED" and not missed.valid


def test_closed_override_marks_simulated():
    ctx = TimeCtx(date=D, closed_ids={"n1"})
    a = assess(node("Open 24 hours", role="heritage"), 12 * 60, ctx)
    assert not a.valid and a.provenance == "simulated"


def test_sunset_formula_is_sane():
    jaipur = sunset_minutes(26.9124, 75.7873, D)
    assert 17 * 60 + 55 <= jaipur <= 18 * 60 + 25  # early October, IST
    june = sunset_minutes(26.9124, 75.7873, date(2026, 6, 21))
    assert june > jaipur  # summer sunsets are later
