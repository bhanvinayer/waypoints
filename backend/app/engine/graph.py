"""The Temporal Experience Graph.

    NODE = place / experience (with opening intervals, event windows, geometry relative to the route)
    EDGE = travel transition (estimated from route geometry, upgraded to OBSERVED by google_maps_directions)

A node is never scored globally — only for a concrete journey: arrival time, detour, preferences, mode.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from ..schemas import ExperienceNode, Location, Model, PlanState, Route, TemporalAssessment
from .geo import cumulative_km, haversine_km
from .temporal import TimeCtx, assess

ORIGIN_ID = "__origin__"
DEST_ID = "__dest__"
LOCAL_MIN_PER_KM = 2.6  # minutes per straight-line km on local roads (includes road factor)
LOCAL_ROAD_FACTOR = 1.35
FUEL_INR_PER_KM = 8.0
CITY_RADIUS_KM = 15.0


class PrefProfile(Model):
    interests: list[str] = []
    styles: list[str] = []
    budget_level: Optional[int] = None
    wants: dict[str, bool] = {}
    pace: str = "balanced"


class JourneyGraph(Model):
    date: str
    origin: Location
    destination: Location
    route: Route
    nodes: dict[str, ExperienceNode]
    observed_legs: dict[str, float] = {}
    sunset_min: Optional[int] = None
    profile: PrefProfile = PrefProfile()

    @property
    def d(self) -> date:
        return date.fromisoformat(self.date)

    def time_ctx(self, state: PlanState | None = None) -> TimeCtx:
        st = state or PlanState()
        return TimeCtx(date=self.d, sunset_min=self.sunset_min, event_shift_min=st.event_shift_min, closed_ids=set(st.closed_ids))


@dataclass
class Anchor:
    id: str
    lat: float
    lon: float
    p_km: float
    access_min: float
    access_km: float


class TravelModel:
    """Travel-time model over the graph.

    leg(a, b) = min( exit a -> along main route -> enter b ,  direct local road )   [clusters use the local road]
    Observed directions (google_maps_directions) override the estimate for specific pairs.
    """

    def __init__(self, graph: JourneyGraph, use_observed: bool = True):
        self.g = graph
        self.use_observed = use_observed
        r = graph.route
        self.route_km = max(r.distance_km, 0.1)
        self.route_min = max(r.duration_min, 1.0)
        self.anchors: dict[str, Anchor] = {
            ORIGIN_ID: Anchor(ORIGIN_ID, graph.origin.latitude, graph.origin.longitude, 0.0, 0.0, 0.0),
            DEST_ID: Anchor(DEST_ID, graph.destination.latitude, graph.destination.longitude, self.route_km, 0.0, 0.0),
        }
        for n in graph.nodes.values():
            self.anchors[n.id] = Anchor(n.id, n.latitude, n.longitude, n.progress_km, n.lateral_km * LOCAL_MIN_PER_KM, n.lateral_km * LOCAL_ROAD_FACTOR)
        self._memo: dict[tuple[str, str], tuple[float, float, str]] = {}

    def anchor(self, node_id: str) -> Anchor:
        return self.anchors[node_id]

    def leg(self, a_id: str, b_id: str) -> tuple[float, float, str]:
        """(minutes, km, provenance)"""
        key = (a_id, b_id)
        hit = self._memo.get(key)
        if hit:
            return hit
        obs = self.g.observed_legs.get(f"{a_id}|{b_id}") if self.use_observed else None
        a, b = self.anchors[a_id], self.anchors[b_id]
        direct = haversine_km((a.lat, a.lon), (b.lat, b.lon))
        dp = abs(b.p_km - a.p_km)
        via_min = a.access_min + dp / self.route_km * self.route_min + b.access_min
        via_km = a.access_km + dp + b.access_km
        loc_min = direct * LOCAL_MIN_PER_KM + (2.0 if direct > 0.2 else 0.0)
        loc_km = direct * LOCAL_ROAD_FACTOR
        dest_xy = (self.g.destination.latitude, self.g.destination.longitude)
        origin_xy = (self.g.origin.latitude, self.g.origin.longitude)
        same_city = any(
            haversine_km((a.lat, a.lon), c) < CITY_RADIUS_KM and haversine_km((b.lat, b.lon), c) < CITY_RADIUS_KM for c in (dest_xy, origin_xy)
        )
        if same_city or (direct < 25 and loc_min < via_min):
            est = (loc_min, loc_km)  # inside one city: city roads, not the highway
        else:
            est = (via_min, via_km)
        out = (obs, est[1], "observed") if obs is not None else (est[0], est[1], "inferred")
        self._memo[key] = out
        return out

    def minutes(self, a_id: str, b_id: str) -> float:
        return self.leg(a_id, b_id)[0]

    def estimate(self, a_id: str, b_id: str) -> float:
        """Pure geometric estimate (ignores observed overrides)."""
        if self.use_observed:
            return TravelModel(self.g, use_observed=False).minutes(a_id, b_id)
        return self.minutes(a_id, b_id)

    def skip_leg(self, prv: str, mid: str, nxt: str) -> float:
        """Travel prv -> nxt *without* visiting mid, expressed in the same 'units' as the legs through mid.

        If both legs through mid are observed we scale the estimate by the observed/estimated ratio, so detour = (via mid) - (direct)
        stays internally consistent even when Google is slower/faster than our geometric estimate."""
        direct = self.minutes(prv, nxt)
        if (prv, nxt) in self._observed_pairs():
            return direct
        o1, o2 = self.g.observed_legs.get(f"{prv}|{mid}"), self.g.observed_legs.get(f"{mid}|{nxt}")
        if self.use_observed and o1 is not None and o2 is not None:
            est_sum = self._est().minutes(prv, mid) + self._est().minutes(mid, nxt)
            k = max(0.7, min(1.6, (o1 + o2) / est_sum)) if est_sum > 0 else 1.0
            return self._est().minutes(prv, nxt) * k
        return direct

    def _observed_pairs(self) -> set[tuple[str, str]]:
        return {tuple(k.split("|", 1)) for k in self.g.observed_legs} if self.use_observed else set()  # type: ignore[misc]

    def _est(self) -> "TravelModel":
        if not hasattr(self, "_est_model"):
            self._est_model = self if not self.use_observed else TravelModel(self.g, use_observed=False)
        return self._est_model


@dataclass
class ChainStop:
    node: ExperienceNode
    arrival: int
    start: int
    depart: int
    wait: int
    leg_min: float
    leg_km: float
    leg_src: str
    detour_min: float
    detour_km: float
    assessment: TemporalAssessment


@dataclass
class SkippedStop:
    node: ExperienceNode
    arrival: int
    assessment: TemporalAssessment


@dataclass
class ChainResult:
    stops: list[ChainStop] = field(default_factory=list)
    skipped: list[SkippedStop] = field(default_factory=list)
    arrive_min: int = 0
    final_leg_min: float = 0.0
    travel_minutes: int = 0
    detour_total: float = 0.0
    start_min: int = 0

    @property
    def all_valid(self) -> bool:
        return all(s.assessment.valid for s in self.stops)


def run_chain(graph: JourneyGraph, seq: list[str], state: PlanState, tm: TravelModel | None = None, skip_invalid: bool = False) -> ChainResult:
    """Deterministically walk the journey: arrival = previous departure + travel, then assess every stop.

    skip_invalid=True models a traveller who bypasses a stop that cannot work (used by what-if simulation).
    """
    tm = tm or TravelModel(graph)
    ctx = graph.time_ctx(state)
    t = float(state.start_min + state.delay_min)
    prev = ORIGIN_ID
    res = ChainResult(start_min=state.start_min)
    kept: list[tuple[ExperienceNode, int, int, int, int, float, float, str, TemporalAssessment]] = []
    travel_total = 0.0
    for nid in seq:
        node = graph.nodes[nid]
        leg_min, leg_km, src = tm.leg(prev, nid)
        arrival = int(round(t + leg_min))
        a = assess(node, arrival, ctx)
        if skip_invalid and not a.valid:
            res.skipped.append(SkippedStop(node, arrival, a))
            continue
        start = a.start_min if a.valid else arrival
        depart = (a.depart_min if a.valid else arrival + node.estimated_visit_minutes) + state.overruns.get(nid, 0)
        kept.append((node, arrival, start, depart, a.wait_min, leg_min, leg_km, src, a))
        travel_total += leg_min
        t = float(depart)
        prev = nid
    final_min, final_km, _ = tm.leg(prev, DEST_ID)
    res.final_leg_min = final_min
    res.arrive_min = int(round(t + final_min))
    travel_total += final_min
    res.travel_minutes = int(round(travel_total))

    ids = [ORIGIN_ID] + [k[0].id for k in kept] + [DEST_ID]
    direct_min = tm.minutes(ORIGIN_ID, DEST_ID)
    res.detour_total = max(0.0, travel_total - direct_min)
    for i, (node, arrival, start, depart, wait, leg_min, leg_km, src, a) in enumerate(kept):
        prv, nxt = ids[i], ids[i + 2]
        d_min = tm.minutes(prv, node.id) + tm.minutes(node.id, nxt) - tm.skip_leg(prv, node.id, nxt)
        d_km = tm.leg(prv, node.id)[1] + tm.leg(node.id, nxt)[1] - tm.leg(prv, nxt)[1]
        res.stops.append(
            ChainStop(node, arrival, start, depart, wait, leg_min, leg_km, src, max(0.0, d_min), max(0.0, d_km), a)
        )
    return res
