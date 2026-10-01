from datetime import date

from app.engine.parsing import (
    classify_role, intervals_for_date, parse_day_hours, parse_duration_text, parse_event, parse_event_times, parse_operating_hours, parse_price,
)
from app.engine.timeutils import fmt_clock, parse_clock, resolve_date


def test_hours_simple_and_unicode():
    assert parse_day_hours("10 am–6 pm") == [(600, 1080)]
    assert parse_day_hours("9 am–1 pm, 4–9 pm") == [(540, 780), (960, 1260)]


def test_hours_special_cases():
    assert parse_day_hours("Open 24 hours") == [(0, 1440)]
    assert parse_day_hours("Closed") == []
    assert parse_day_hours("") is None
    assert parse_day_hours("6 pm–2 am") == [(1080, 1560)]  # overnight
    assert parse_day_hours("12–11 pm") == [(720, 1380)]  # suffix inherited from the closing time
    assert parse_day_hours("11–2 pm") == [(660, 840)]


def test_operating_hours_dict_and_overnight_spill():
    intervals, texts = parse_operating_hours({"friday": "6 pm–2 am", "saturday": "Closed"})
    assert texts["friday"].startswith("6")
    friday = date(2026, 10, 2)
    saturday = date(2026, 10, 3)
    assert intervals_for_date(intervals, friday) == [(1080, 1560)]
    assert intervals_for_date(intervals, saturday) == [(0, 120)]  # Friday night spills into Saturday 00:00-02:00


def test_duration_text():
    assert parse_duration_text("People typically spend 1 hr 30 min here") == 90
    assert parse_duration_text("People typically spend 2 to 3 hr here") == 150
    assert parse_duration_text("45 min") == 45
    assert parse_duration_text(None) is None


def test_price_and_role():
    assert parse_price("₹₹") == (2, "₹₹")
    assert parse_price("$$$")[0] == 3
    assert parse_price("₹200–400")[0] == 2
    assert classify_role("Laxmi Misthan Bhandar", ["Restaurant", "Sweet shop"]) == "meal"
    assert classify_role("Rawat", ["Sweet shop"]) == "snack"
    assert classify_role("Amer Fort", ["Fort"]) == "heritage"
    assert classify_role("Kingdom of Dreams", ["Amusement park"]) == "activity"


def test_clock_helpers():
    assert parse_clock("8:00 AM") == 480
    assert parse_clock("20:30") == 1230
    assert fmt_clock(1230) == "8:30 PM"
    assert resolve_date("Saturday", today=date(2026, 10, 1)) == date(2026, 10, 3)
    assert resolve_date("2026-10-03") == date(2026, 10, 3)


def test_event_parsing_filters_by_date():
    ev = {"title": "Folk night", "date": {"start_date": "Oct 3", "when": "Sat, Oct 3, 7:30 – 9:30 PM IST"}, "venue": {"name": "JKK"}}
    info = parse_event(ev, date(2026, 10, 3))
    assert info and info.start_min == 19 * 60 + 30 and info.end_min == 21 * 60 + 30
    assert parse_event(ev, date(2026, 10, 4)) is None  # different day -> not usable
    assert parse_event_times("Tomorrow, 8 PM") == (1200, 1320)
