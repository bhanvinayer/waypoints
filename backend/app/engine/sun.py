"""Sunrise / sunset from latitude, longitude and date (NOAA general solar position formulas).

The result is INFERRED (pure astronomy), never an observed web fact, and is labelled as such in the UI.
"""
from __future__ import annotations

import math
from datetime import date


def tz_offset_minutes(lat: float, lon: float) -> int:
    if 6.0 <= lat <= 37.5 and 68.0 <= lon <= 98.0:
        return 330  # India Standard Time
    return int(round(lon / 15.0)) * 60


def _solar(lat: float, lon: float, d: date, tz_min: int, sunset: bool) -> int | None:
    doy = d.timetuple().tm_yday
    g = 2 * math.pi / 365 * (doy - 1 + (12 - 12) / 24)
    eq = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = (
        0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
        + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g)
    )
    lat_r = math.radians(lat)
    cos_ha = math.cos(math.radians(90.833)) / (math.cos(lat_r) * math.cos(decl)) - math.tan(lat_r) * math.tan(decl)
    if cos_ha > 1 or cos_ha < -1:
        return None  # polar day / night
    ha = math.degrees(math.acos(cos_ha))
    utc_min = 720 - 4 * (lon - ha) - eq if sunset else 720 - 4 * (lon + ha) - eq
    return int(round(utc_min + tz_min))


def sunset_minutes(lat: float, lon: float, d: date, tz_min: int | None = None) -> int | None:
    return _solar(lat, lon, d, tz_offset_minutes(lat, lon) if tz_min is None else tz_min, True)


def sunrise_minutes(lat: float, lon: float, d: date, tz_min: int | None = None) -> int | None:
    return _solar(lat, lon, d, tz_offset_minutes(lat, lon) if tz_min is None else tz_min, False)
