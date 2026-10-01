"""Small geographic toolbox: distances, projection onto the route polyline, sampling."""
from __future__ import annotations

import math
from typing import Sequence

EARTH_KM = 6371.0088
LatLon = tuple[float, float]


def haversine_km(a: LatLon, b: LatLon) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * EARTH_KM * math.asin(min(1.0, math.sqrt(d)))


def interpolate(a: LatLon, b: LatLon, t: float) -> LatLon:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def straight_polyline(a: LatLon, b: LatLon, n: int = 24) -> list[LatLon]:
    return [interpolate(a, b, i / (n - 1)) for i in range(n)]


def cumulative_km(poly: Sequence[LatLon]) -> list[float]:
    out = [0.0]
    for i in range(1, len(poly)):
        out.append(out[-1] + haversine_km(poly[i - 1], poly[i]))
    return out


def polyline_length_km(poly: Sequence[LatLon]) -> float:
    return cumulative_km(poly)[-1] if len(poly) > 1 else 0.0


def project_on_polyline(poly: Sequence[LatLon], cum: Sequence[float], p: LatLon) -> tuple[float, float]:
    """Return (distance along the polyline in km, lateral distance to the polyline in km)."""
    best = (0.0, float("inf"))
    for i in range(len(poly) - 1):
        a, b = poly[i], poly[i + 1]
        kx = math.cos(math.radians((a[0] + b[0]) / 2)) * 111.32
        ky = 110.574
        ax, ay = a[1] * kx, a[0] * ky
        bx, by = b[1] * kx, b[0] * ky
        px, py = p[1] * kx, p[0] * ky
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
        cx, cy = ax + t * dx, ay + t * dy
        dist = math.hypot(px - cx, py - cy)
        if dist < best[1]:
            seg_len = cum[i + 1] - cum[i]
            best = (cum[i] + t * seg_len, dist)
    return best


def point_at_km(poly: Sequence[LatLon], cum: Sequence[float], km: float) -> LatLon:
    if km <= 0:
        return poly[0]
    if km >= cum[-1]:
        return poly[-1]
    for i in range(1, len(cum)):
        if cum[i] >= km:
            seg = cum[i] - cum[i - 1]
            t = 0 if seg == 0 else (km - cum[i - 1]) / seg
            return interpolate(poly[i - 1], poly[i], t)
    return poly[-1]


def downsample(poly: Sequence[LatLon], max_points: int = 400) -> list[LatLon]:
    if len(poly) <= max_points:
        return list(poly)
    step = (len(poly) - 1) / (max_points - 1)
    idx = sorted({round(i * step) for i in range(max_points)} | {len(poly) - 1})
    return [poly[i] for i in idx]


def axis_t(origin: LatLon, dest: LatLon, p: LatLon) -> float:
    """Scalar projection of p on the origin->destination axis (0 = origin, 1 = destination, can exceed)."""
    kx = math.cos(math.radians((origin[0] + dest[0]) / 2)) * 111.32
    ky = 110.574
    ox, oy = origin[1] * kx, origin[0] * ky
    dx, dy = dest[1] * kx - ox, dest[0] * ky - oy
    px, py = p[1] * kx - ox, p[0] * ky - oy
    denom = dx * dx + dy * dy
    return 0.0 if denom == 0 else (px * dx + py * dy) / denom


def bearing_label(a: LatLon, b: LatLon) -> str:
    y = math.sin(math.radians(b[1] - a[1])) * math.cos(math.radians(b[0]))
    x = math.cos(math.radians(a[0])) * math.sin(math.radians(b[0])) - math.sin(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.cos(math.radians(b[1] - a[1]))
    deg = (math.degrees(math.atan2(y, x)) + 360) % 360
    names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]
    return names[int((deg + 22.5) // 45) % 8]
