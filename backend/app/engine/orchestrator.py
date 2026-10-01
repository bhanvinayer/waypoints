"""SearchOrchestrator — runs the whole discovery pipeline and reports REAL progress for every stage.

 1 parse journey            9 retrieve events / news          13 score + optimise (5 modes)
 2 route corridor          10 retrieve directions             14 stress-test
 3 corridor regions        11 build temporal graph            15 repair
 4 candidate search        12 validate temporal windows       16 respond
 5-8 details / hours / reviews
"""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import date, timedelta
from typing import Any

from .. import trace
from ..config import get_settings
from ..llm import agents
from ..schemas import (
    CorridorTown, CurrentSignal, Evidence, EventInfo, ExperienceNode, FlightOption, JobInfo, JourneyRequest, JourneyResponse,
    Location, PlanState, Route, StageInfo, StaySuggestion, ROUTE_MODES,
)
from ..serpapi import tools
from ..serpapi.client import SerpApiError
from ..store import JourneyRecord, get_store
from . import ingest
from .geo import axis_t, cumulative_km, haversine_km, project_on_polyline, straight_polyline
from .graph import DEST_ID, ORIGIN_ID, JourneyGraph, PrefProfile, TravelModel, run_chain
from .optimizer import MIN_TEMPORAL, InfeasibleRoute, optimize
from .parsing import normalise_name, parse_budget, parse_event
from .respond import build_response
from .scoring import MODES, experience_quality, preference_fit, route_fit
from .sun import sunset_minutes
from .timeutils import fmt_clock, fmt_duration, parse_clock, resolve_date

STAGES = [
    ("understand", "Understanding your journey"),
    ("route", "Mapping your route"),
    ("discover", "Finding experiences nearby"),
    ("hours", "Checking opening windows"),
    ("events", "Checking events"),
    ("signals", "Checking current signals"),
    ("feasibility", "Testing route feasibility"),
    ("stress", "Stress-testing your plan"),
]

IATA = {
    "delhi": "DEL", "new delhi": "DEL", "mumbai": "BOM", "bengaluru": "BLR", "bangalore": "BLR", "chennai": "MAA", "kolkata": "CCU",
    "hyderabad": "HYD", "pune": "PNQ", "ahmedabad": "AMD", "jaipur": "JAI", "goa": "GOI", "kochi": "COK", "lucknow": "LKO",
    "chandigarh": "IXC", "udaipur": "UDR", "jodhpur": "JDH", "varanasi": "VNS", "amritsar": "ATQ", "indore": "IDR", "bhopal": "BHO",
    "patna": "PAT", "guwahati": "GAU", "srinagar": "SXR", "leh": "IXL", "dehradun": "DED", "nagpur": "NAG", "coimbatore": "CJB",
    "thiruvananthapuram": "TRV", "visakhapatnam": "VTZ", "ranchi": "IXR",
}

MAX_FINALISTS = 22
LATERAL_CAP_KM = 40.0


class DiscoveryError(Exception):
    def __init__(self, message: str, code: str = "discovery_failed", retriable: bool = True):
        super().__init__(message)
        self.message, self.code, self.retriable = message, code, retriable


class Progress:
    """Real stage reporting: the orchestrator calls start/done as it actually performs each step."""

    def __init__(self, job_id: str, data_mode: str = "live"):
        self.job = JobInfo(id=job_id, status="running", stages=[StageInfo(key=k, label=l) for k, l in STAGES], data_mode=data_mode)  # type: ignore[arg-type]
        self._t: dict[str, float] = {}
        get_store().put_job(self.job)

    def _stage(self, key: str) -> StageInfo:
        return next(s for s in self.job.stages if s.key == key)

    def start(self, key: str) -> None:
        import time

        s = self._stage(key)
        if s.status == "pending":
            s.status = "running"
            s.started_at = trace.now_iso()
            self._t[key] = time.perf_counter()

    def done(self, key: str, detail: str | None = None, skipped: bool = False) -> None:
        import time

        s = self._stage(key)
        self.start(key)
        s.status = "skipped" if skipped else "done"
        s.detail = detail
        s.duration_ms = int((time.perf_counter() - self._t.get(key, time.perf_counter())) * 1000)

    def fail(self, key: str, message: str) -> None:
        s = self._stage(key)
        s.status = "error"
        s.detail = message

    def finish(self, journey_id: str) -> None:
        self.job.status = "done"
        self.job.journey_id = journey_id

    def error(self, err: DiscoveryError) -> None:
        self.job.status = "error"
        self.job.error_code, self.job.error_message, self.job.retriable = err.code, err.message, err.retriable


class _NullProgress(Progress):
    def __init__(self) -> None:  # no store registration
        self.job = JobInfo(id="null", status="running", stages=[StageInfo(key=k, label=l) for k, l in STAGES])
        self._t = {}


# ------------------------------------------------------------------------------------------------ geometry helpers
class RouteGeom:
    def __init__(self, poly: list[tuple[float, float]], distance_km: float):
        self.poly = poly
        raw = cumulative_km(poly)
        scale = (distance_km / raw[-1]) if raw[-1] > 0 else 1.0
        self.cum = [c * scale for c in raw]
        self.distance_km = distance_km
        self.origin, self.dest = poly[0], poly[-1]

    def locate(self, lat: float, lon: float) -> tuple[float, float]:
        """(progress_km along the route, lateral km)"""
        pk, lat_km = project_on_polyline(self.poly, self.cum, (lat, lon))
        return pk, lat_km

    def place(self, node: ExperienceNode) -> None:
        pk, lat_km = self.locate(node.latitude, node.longitude)
        node.progress_km = round(pk, 2)
        node.progress = round(pk / self.distance_km, 4) if self.distance_km else 0.0
        node.lateral_km = round(lat_km, 2)
        node.access_minutes = round(lat_km * 2.6, 1)
        node.axis_t = round(axis_t(self.origin, self.dest, (node.latitude, node.longitude)), 4)


def _first_coords(data: dict[str, Any]) -> tuple[float, float, str] | None:
    pr = data.get("place_results")
    if isinstance(pr, dict) and pr.get("gps_coordinates"):
        g = pr["gps_coordinates"]
        return float(g["latitude"]), float(g["longitude"]), str(pr.get("title") or "")
    for r in data.get("local_results") or []:
        g = r.get("gps_coordinates")
        if g:
            return float(g["latitude"]), float(g["longitude"]), str(r.get("title") or "")
    return None


async def _safe(coro, ctx, what: str):
    try:
        return await coro
    except SerpApiError as exc:
        ctx.warn(f"{what}: {exc.message}")
        return None


def _dedupe(nodes: list[ExperienceNode]) -> list[ExperienceNode]:
    out: list[ExperienceNode] = []
    for n in sorted(nodes, key=lambda x: -(x.review_count or 0)):
        dup = False
        nn = normalise_name(n.name)
        for m in out:
            if m.id == n.id:
                dup = True
                break
            close = haversine_km((n.latitude, n.longitude), (m.latitude, m.longitude)) < 0.15
            if close and (nn == normalise_name(m.name) or nn in normalise_name(m.name) or normalise_name(m.name) in nn):
                dup = True
                break
        if not dup:
            out.append(n)
    return out


def _prelim(n: ExperienceNode, profile: PrefProfile) -> float:
    pref, _ = preference_fit(n, profile)
    return 0.4 * pref + 0.3 * experience_quality(n, profile) + 0.3 * route_fit(2 * n.lateral_km * 2.6)


# ------------------------------------------------------------------------------------------------ the orchestrator
class SearchOrchestrator:
    def __init__(self) -> None:
        self.settings = get_settings()

    def resolve_times(self, req: JourneyRequest) -> tuple[date, int, int]:
        d = resolve_date(req.date)
        start = parse_clock(req.start_time, 480)
        end = parse_clock(req.end_time, min(start + 13 * 60, 23 * 60 + 30)) if req.end_time else min(start + 13 * 60, 23 * 60 + 30)
        if end <= start + 60:
            end = start + 13 * 60
        return d, start, end

    def data_mode(self, req: JourneyRequest) -> str:
        if req.demo is True:
            return "demo"
        if req.demo is False:
            return "live"
        return "demo" if self.settings.demo_mode else "live"

    async def discover(self, req: JourneyRequest, progress: Progress | None = None, journey_id: str | None = None) -> JourneyResponse:
        progress = progress or _NullProgress()
        mode = self.data_mode(req)
        if mode == "demo":
            req = req.model_copy(update={"origin": "Delhi", "destination": "Jaipur"})
        elif not self.settings.serpapi_configured:
            raise DiscoveryError("Live search is unavailable: SERPAPI_KEY is not configured on the server. Use the demo journey or add a key.", "serpapi_not_configured", False)
        try:
            d, start_min, end_min = self.resolve_times(req)
        except ValueError as exc:
            raise DiscoveryError(str(exc), "bad_request", False) from exc

        ctx = trace.JourneyContext(data_mode=mode, max_calls=self.settings.max_calls_per_journey, journey_date=d.isoformat())
        journey_id = journey_id or uuid.uuid4().hex[:12]
        with trace.journey_context(ctx):
            return await self._run(req, d, start_min, end_min, mode, ctx, progress, journey_id)

    async def _run(self, req: JourneyRequest, d: date, start_min: int, end_min: int, mode: str, ctx: trace.JourneyContext, progress: Progress, journey_id: str) -> JourneyResponse:
        # ---------------------------------------------------------------- 1. understand
        progress.start("understand")
        t = trace.StepTimer("analyze", "Parse journey request", "engine")
        analysis = await agents.journey_analyst(req, start_min, end_min)
        t.finish(detail=f"styles={analysis.styles} interests={analysis.interests} mode={analysis.recommended_mode}")
        profile = PrefProfile(interests=analysis.interests, styles=analysis.styles, budget_level=parse_budget(req.budget), wants=analysis.wants, pace=analysis.pace)
        chosen_mode = req.mode or analysis.recommended_mode
        progress.done("understand", f"{', '.join(analysis.styles + analysis.interests) or 'general'} · {MODES[chosen_mode].label} route · {analysis.engine}")

        # ---------------------------------------------------------------- 2. route + corridor
        progress.start("route")
        route_info, origin, dest, warnings_route = await self._route(req, ctx)
        for w in warnings_route:
            ctx.warn(w)
        geom = RouteGeom(route_info["poly"], route_info["distance_km"])
        corridor = await self._corridor(analysis.corridor_hints, geom, origin, dest, ctx)
        anchors = self._anchors(corridor, geom, dest)
        route = Route(
            distance_km=round(route_info["distance_km"], 1), duration_min=round(route_info["duration_min"], 1), polyline=[list(p) for p in route_info["poly"]],
            via=route_info.get("via"), geometry_source=route_info["geometry_source"], corridor=corridor,
        )
        towns = " → ".join([origin.name.split(",")[0], *[c.name for c in corridor], dest.name.split(",")[0]])
        progress.done("route", f"{route.distance_km:.0f} km · {fmt_duration(route.duration_min)} · {towns}")

        sunset = sunset_minutes(dest.latitude, dest.longitude, d)

        # ---------------------------------------------------------------- 3. discovery (+ background evidence tasks)
        progress.start("discover")
        events_task = asyncio.create_task(self._events(req, d, dest, ctx))
        news_task = asyncio.create_task(self._news(req, origin, dest, corridor, ctx))
        stay_task = asyncio.create_task(self._stay(req, d, dest, ctx)) if req.include_stay else None
        flight_task = asyncio.create_task(self._flights(req, d, ctx))
        try:
            return await self._run_rest(
                req, d, start_min, end_min, mode, ctx, progress, journey_id, analysis, profile, chosen_mode, origin, dest, geom, route,
                corridor, anchors, sunset, events_task, news_task, stay_task, flight_task,
            )
        except BaseException:
            for tk in (events_task, news_task, stay_task, flight_task):
                if tk and not tk.done():
                    tk.cancel()
            raise

    async def _run_rest(self, req, d, start_min, end_min, mode, ctx, progress, journey_id, analysis, profile, chosen_mode, origin, dest, geom, route,
                        corridor, anchors, sunset, events_task, news_task, stay_task, flight_task) -> JourneyResponse:

        max_searches = 9 if chosen_mode == "fastest" else 16
        t = trace.StepTimer("plan", "Plan corridor searches", "engine")
        plan, plan_engine = await agents.discovery_planner(analysis.styles, analysis.interests, analysis.wants, anchors, max_searches, chosen_mode)
        t.finish(results=len(plan), detail=f"{len(plan)} searches · planned by {plan_engine}")
        raw_nodes = await self._search(plan, anchors, ctx, mode)
        nodes = self._build_nodes(raw_nodes, geom)
        if not nodes and not [s for s in ctx.steps if s.kind == "serpapi" and s.phase == "maps" and s.ok]:
            raise DiscoveryError("Live search temporarily unavailable.", "serpapi_unavailable", True)
        finalists = self._finalists(nodes, profile)
        progress.done("discover", f"{len(finalists)} candidates from {len(plan)} corridor searches")

        # ---------------------------------------------------------------- 4. hours / reviews / curation
        progress.start("hours")
        await self._details(finalists, ctx, mode)
        known = sum(1 for n in finalists if n.hours_known)
        t = trace.StepTimer("curate", "Experience curation", "engine")
        curation = await self._curate(finalists, profile)
        t.finish(results=len(finalists), detail=f"curated by {curation.engine}")
        progress.done("hours", f"{known}/{len(finalists)} opening schedules verified · {sum(1 for n in finalists if n.reviews)} review sets read")

        # ---------------------------------------------------------------- 5. events
        progress.start("events")
        event_infos = await events_task
        event_nodes = await self._event_nodes(event_infos, dest, geom, ctx, mode)
        city_signals: list[CurrentSignal] = []
        evidence: list[Evidence] = []
        for en in event_nodes:
            finalists.append(en)
        progress.done("events", f"{len(event_infos)} events on {d.strftime('%b')} {d.day} · {len(event_nodes)} reachable", skipped=not event_infos and not event_nodes)

        # ---------------------------------------------------------------- 6. signals (news, sunset)
        progress.start("signals")
        news_items = await news_task
        news_signals, news_evidence = await self._news_signals(news_items, finalists, origin, dest, corridor, d, mode)
        city_signals.extend(news_signals)
        evidence.extend(news_evidence)
        if sunset is not None:
            ev_id = "ev_sunset"
            evidence.append(Evidence(id=ev_id, kind="computed", title=f"Sunset in {dest.name.split(',')[0]}: {fmt_clock(sunset)}", detail="Computed from latitude, longitude and date (NOAA solar formulae) — an inference, not a web fact.", source="waypoints_engine", provenance="inferred", mode=mode))  # type: ignore[arg-type]
            city_signals.append(CurrentSignal(id="sig_sunset", kind="sunset", title=f"Sunset {fmt_clock(sunset)}", detail="Golden-hour window used for sunset-sensitive stops", severity="info", evidence_id=ev_id, provenance="inferred", start_min=sunset - 75, end_min=sunset + 5))
        for en in event_nodes:
            city_signals.append(en.current_signals[0])
            evidence.extend(e for e in en.evidence if e.kind == "event")
        progress.done("signals", f"{len([s for s in city_signals if s.kind in ('news', 'closure')])} news items triaged · sunset {fmt_clock(sunset) if sunset else 'n/a'}")

        # ---------------------------------------------------------------- 7. feasibility
        progress.start("feasibility")
        graph = JourneyGraph(
            date=d.isoformat(), origin=origin, destination=dest, route=route, nodes={n.id: n for n in finalists},
            sunset_min=sunset, profile=profile,
        )
        for n in graph.nodes.values():
            geom.place(n)
        directions_evidence = Evidence(
            id="ev_route", kind="directions", title=f"{origin.name.split(',')[0]} → {dest.name.split(',')[0]}: {route.distance_km:.0f} km, {fmt_duration(route.duration_min)}",
            detail=f"via {route.via or 'main road'} · geometry: {route.geometry_source.replace('_', ' ')}", source="google_maps_directions",
            provenance="observed" if route.geometry_source != "estimated_straight" else "inferred", mode=mode,  # type: ignore[arg-type]
        )
        evidence.insert(0, directions_evidence)

        state = PlanState(mode=chosen_mode, start_min=start_min, end_by_min=end_min)  # type: ignore[arg-type]
        tm = TravelModel(graph)
        try:
            opt = optimize(graph, state, MODES[chosen_mode], tm=tm)
        except InfeasibleRoute:
            opt = None
        seq = opt.sequence if opt else []
        seq = await self.refine_legs(graph, state, seq, ctx)  # observed travel times for the chosen route
        await self._web_evidence(graph, seq, ctx, mode)
        progress.done("feasibility", f"{len(seq)} stops validated against opening windows · {sum(1 for k in graph.observed_legs)} legs confirmed by directions")

        # ---------------------------------------------------------------- 8. stress + respond
        progress.start("stress")
        stay = (await stay_task) if stay_task else []
        flights = await flight_task
        warnings = list(ctx.warnings)
        resp = await build_response(
            journey_id=journey_id, version=1, created_at=trace.now_iso(), data_mode=mode, request=req, graph=graph, state=state, seq=seq,
            trace_steps=ctx.steps, warnings=warnings, signals=city_signals, evidence=evidence, stay=stay, flights=flights,
        )
        store = get_store()
        store.put(JourneyRecord(id=journey_id, response=resp, graph=graph, state=state, sequence=seq))
        progress.done("stress", f"Plan Robustness {resp.robustness.score}% · {len(resp.route_options)} route modes compared")
        progress.finish(journey_id)
        return resp

    # ------------------------------------------------------------------------------------------------ route
    async def _route(self, req: JourneyRequest, ctx: trace.JourneyContext) -> tuple[dict[str, Any], Location, Location, list[str]]:
        warnings: list[str] = []
        parsed = None
        try:
            data = await tools.get_directions(req.origin, req.destination, phase="route")
            parsed = ingest.parse_directions(data)
        except SerpApiError as exc:
            warnings.append(f"Directions unavailable ({exc.message}); route geometry is estimated.")
        o_coords = d_coords = None
        if parsed and len(parsed["places"]) >= 2:
            o_coords = (parsed["places"][0]["lat"], parsed["places"][0]["lon"], parsed["places"][0].get("address") or req.origin)
            d_coords = (parsed["places"][-1]["lat"], parsed["places"][-1]["lon"], parsed["places"][-1].get("address") or req.destination)
        if o_coords is None or d_coords is None:
            res = await asyncio.gather(
                _safe(tools.search_maps(req.origin, phase="route"), ctx, "Geocoding origin"),
                _safe(tools.search_maps(req.destination, phase="route"), ctx, "Geocoding destination"),
            )
            o = _first_coords(res[0] or {})
            dd = _first_coords(res[1] or {})
            if not o or not dd:
                raise DiscoveryError("Live search temporarily unavailable.", "serpapi_unavailable", True)
            o_coords = (o[0], o[1], req.origin)
            d_coords = (dd[0], dd[1], req.destination)
        origin = Location(name=req.origin.strip().title() if req.origin.islower() else req.origin.strip(), latitude=o_coords[0], longitude=o_coords[1], address=o_coords[2])
        dest = Location(name=req.destination.strip().title() if req.destination.islower() else req.destination.strip(), latitude=d_coords[0], longitude=d_coords[1], address=d_coords[2])
        straight = haversine_km((origin.latitude, origin.longitude), (dest.latitude, dest.longitude))
        if parsed and parsed["duration_min"] and parsed["distance_km"]:
            pts = parsed["points"]
            if len(pts) >= 8:
                poly = [(origin.latitude, origin.longitude), *pts, (dest.latitude, dest.longitude)]
                # drop wild points that are nowhere near the corridor
                geometry = "demo_snapshot" if ctx.data_mode == "demo" else "serpapi_directions"
            else:
                poly, geometry = straight_polyline((origin.latitude, origin.longitude), (dest.latitude, dest.longitude), 30), "estimated_straight"
                if ctx.data_mode == "demo":
                    geometry = "demo_snapshot"
            return {"poly": poly, "distance_km": parsed["distance_km"], "duration_min": parsed["duration_min"], "via": parsed.get("via"), "geometry_source": geometry}, origin, dest, warnings
        poly = straight_polyline((origin.latitude, origin.longitude), (dest.latitude, dest.longitude), 30)
        km = straight * 1.25
        if not warnings:
            warnings.append("Directions returned no route; geometry and travel time are estimated.")
        return {"poly": poly, "distance_km": km, "duration_min": km / 55 * 60, "via": None, "geometry_source": "estimated_straight"}, origin, dest, warnings

    async def _corridor(self, hints: list[str], geom: RouteGeom, origin: Location, dest: Location, ctx: trace.JourneyContext) -> list[CorridorTown]:
        if not hints:
            return []
        res = await asyncio.gather(*[
            _safe(tools.search_maps(h, latitude=(geom.origin[0] + geom.dest[0]) / 2, longitude=(geom.origin[1] + geom.dest[1]) / 2, zoom=9, phase="route"), ctx, f"Verify corridor town {h}")
            for h in hints[:7]
        ])
        towns: list[CorridorTown] = []
        for hint, data in zip(hints, res):
            c = _first_coords(data or {})
            if not c:
                continue
            pk, lat_km = geom.locate(c[0], c[1])
            frac = pk / geom.distance_km
            if lat_km > 25 or not (0.05 <= frac <= 0.95):
                continue
            name = hint.strip()
            if any(abs(t.progress - frac) < 0.05 for t in towns):
                continue
            towns.append(CorridorTown(name=name, latitude=c[0], longitude=c[1], progress=round(frac, 3), lateral_km=round(lat_km, 1), verified=True))
        towns.sort(key=lambda t: t.progress)
        return towns

    def _anchors(self, corridor: list[CorridorTown], geom: RouteGeom, dest: Location) -> list[dict[str, Any]]:
        anchors: list[dict[str, Any]] = []
        if len(corridor) >= 3:
            k = min(5, len(corridor))  # evenly spaced along the WHOLE corridor, not just its first half
            picks = [corridor[round(i * (len(corridor) - 1) / (k - 1))] for i in range(k)]
            for c in picks:
                anchors.append({"idx": len(anchors), "name": c.name, "lat": c.latitude, "lon": c.longitude, "fraction": c.progress})
        else:
            fracs = [0.3, 0.7] if geom.distance_km < 40 else [0.2, 0.4, 0.6, 0.8]
            from .geo import point_at_km

            for f in fracs:
                lat, lon = point_at_km(geom.poly, geom.cum, f * geom.distance_km)
                anchors.append({"idx": len(anchors), "name": f"km {round(f * geom.distance_km)} of the route", "lat": lat, "lon": lon, "fraction": f})
        anchors.append({"idx": len(anchors), "name": dest.name.split(",")[0], "lat": dest.latitude, "lon": dest.longitude, "fraction": 1.0, "is_destination": True})
        return anchors

    # ------------------------------------------------------------------------------------------------ discovery
    async def _search(self, plan: list[agents.SearchPlanItem], anchors: list[dict[str, Any]], ctx: trace.JourneyContext, mode: str) -> list[ExperienceNode]:
        async def one(p: agents.SearchPlanItem):
            a = anchors[p.anchor]
            zoom = 12 if a.get("is_destination") else 11
            data = await _safe(tools.search_maps(p.query, latitude=a["lat"], longitude=a["lon"], zoom=zoom, phase="maps"), ctx, f"Maps search '{p.query}'")
            return data

        results = await asyncio.gather(*[one(p) for p in plan])
        nodes: list[ExperienceNode] = []
        for data in results:
            if not data:
                continue
            for r in data.get("local_results") or []:
                n = ingest.node_from_local_result(r, mode)
                if n:
                    nodes.append(n)
        return nodes

    def _build_nodes(self, raw: list[ExperienceNode], geom: RouteGeom) -> list[ExperienceNode]:
        nodes = _dedupe(raw)
        keep: list[ExperienceNode] = []
        for n in nodes:
            geom.place(n)
            if n.lateral_km <= LATERAL_CAP_KM:
                keep.append(n)
        return keep

    def _finalists(self, nodes: list[ExperienceNode], profile: PrefProfile) -> list[ExperienceNode]:
        ranked = sorted(nodes, key=lambda n: -_prelim(n, profile))
        out: list[ExperienceNode] = []
        per_role: dict[str, int] = {}
        for n in ranked:
            if per_role.get(n.role, 0) >= 6:
                continue
            per_role[n.role] = per_role.get(n.role, 0) + 1
            out.append(n)
            if len(out) >= MAX_FINALISTS:
                break
        return out

    async def _details(self, nodes: list[ExperienceNode], ctx: trace.JourneyContext, mode: str) -> None:
        async def detail(n: ExperienceNode) -> None:
            if n.hours_known and n.visit_minutes_source == "observed":
                return
            if not (n.place_id or n.data_id):
                return
            data = await _safe(tools.get_place(place_id=n.place_id, data_id=None if n.place_id else n.data_id, latitude=n.latitude, longitude=n.longitude, phase="places", label_query=n.name), ctx, f"Place details for {n.name}")
            if data:
                ingest.merge_place_details(n, data, mode)

        async def review(n: ExperienceNode) -> None:
            if not n.data_id:
                return
            data = await _safe(tools.get_reviews(n.data_id, num=8, phase="reviews"), ctx, f"Reviews for {n.name}")
            if data:
                ingest.apply_reviews(n, data, mode)

        await asyncio.gather(*[detail(n) for n in nodes])
        top = sorted(nodes, key=lambda n: -(n.review_count or 0))[:12]
        await asyncio.gather(*[review(n) for n in top])

    async def _curate(self, nodes: list[ExperienceNode], profile: PrefProfile) -> agents.CurationResult:
        payload = [
            {"id": n.id, "name": n.name, "types": n.category[:3], "rating": n.rating, "reviews": n.review_count, "role": n.role,
             "snippets": [r.snippet for r in n.reviews[:3]]}
            for n in nodes
        ]
        res = await agents.experience_curator(payload, profile.styles, profile.interests, None)
        for n in nodes:
            n.pref_adjust = res.pref_adjust.get(n.id, 0.0)
            if n.role == "other" and n.id in res.roles:
                n.role = res.roles[n.id]  # type: ignore[assignment]
            if n.id in res.one_liners:
                n.one_liner = res.one_liners[n.id]
        return res

    # ------------------------------------------------------------------------------------------------ events / news / stay / flights
    async def _events(self, req: JourneyRequest, d: date, dest: Location, ctx: trace.JourneyContext) -> list[EventInfo]:
        name = dest.name.split(",")[0]
        data = await _safe(tools.search_events(f"events in {name}", location=dest.address or name, phase="events"), ctx, "Events")
        out: list[EventInfo] = []
        for ev in (data or {}).get("events_results") or []:
            info = parse_event(ev, d)
            if info:
                out.append(info)
        return out

    async def _event_nodes(self, events: list[EventInfo], dest: Location, geom: RouteGeom, ctx: trace.JourneyContext, mode: str) -> list[ExperienceNode]:
        usable = [e for e in events if e.start_min is not None][:4]
        name = dest.name.split(",")[0]

        async def one(e: EventInfo) -> ExperienceNode | None:
            venue_name = e.venue or (e.address or "").split(",")[0]
            if not venue_name:
                return None
            data = await _safe(tools.search_maps(f"{venue_name} {name}", latitude=dest.latitude, longitude=dest.longitude, zoom=12, phase="maps"), ctx, f"Locate event venue {venue_name}")
            for r in (data or {}).get("local_results") or []:
                venue = ingest.node_from_local_result(r, mode)
                if venue:
                    node = ingest.event_node(e, venue, mode)
                    if node:
                        geom.place(node)
                        return node if node.lateral_km <= LATERAL_CAP_KM else None
            return None

        found = await asyncio.gather(*[one(e) for e in usable])
        return [n for n in found if n]

    async def _news(self, req: JourneyRequest, origin: Location, dest: Location, corridor: list[CorridorTown], ctx: trace.JourneyContext) -> list[dict[str, Any]]:
        o, dd = origin.name.split(",")[0], dest.name.split(",")[0]
        qs = [f"{dd} closure OR diversion OR festival OR traffic", f"{o} {dd} highway road closure OR diversion"]
        res = await asyncio.gather(*[_safe(tools.search_news(q, phase="news"), ctx, "News") for q in qs])
        items: list[dict[str, Any]] = []
        seen: set[str] = set()
        for data in res:
            for r in (data or {}).get("news_results") or []:
                key = (r.get("link") or r.get("title") or "").strip()
                if key and key not in seen:
                    seen.add(key)
                    items.append(r)
        return items[:12]

    async def _news_signals(self, items: list[dict[str, Any]], nodes: list[ExperienceNode], origin: Location, dest: Location, corridor: list[CorridorTown], d: date, mode: str) -> tuple[list[CurrentSignal], list[Evidence]]:
        if not items:
            return [], []
        compact = [
            {"i": i, "title": r.get("title", ""), "publisher": (r.get("source") or {}).get("name") if isinstance(r.get("source"), dict) else r.get("source"),
             "date": r.get("date"), "snippet": r.get("snippet", "")}
            for i, r in enumerate(items)
        ]
        tokens = [t.lower() for t in {origin.name.split(",")[0], dest.name.split(",")[0], *[c.name for c in corridor], *[n.name.split()[0] for n in nodes if len(n.name.split()[0]) > 3], "nh48", "highway"} if len(t) > 3]
        triage, engine = await agents.triage_news(compact, tokens, {"origin": origin.name, "destination": dest.name, "date": d.isoformat(), "stops_considered": [n.name for n in nodes][:12]})
        signals: list[CurrentSignal] = []
        evidence: list[Evidence] = []
        for t in triage:
            r = items[t.index]
            pub = compact[t.index]["publisher"]
            ev_id = f"ev_news_{t.index}"
            evidence.append(Evidence(
                id=ev_id, kind="news", title=r.get("title", ""), detail=r.get("snippet", ""), source="google_news", provenance="observed",
                url=r.get("link"), publisher=pub, date=r.get("date"), retrieved_at=trace.now_iso(), mode=mode,  # type: ignore[arg-type]
            ))
            sig = CurrentSignal(
                id=f"sig_news_{t.index}", kind="closure" if t.kind == "closure" else "news", title=r.get("title", ""), detail=t.note, severity=t.severity,  # type: ignore[arg-type]
                evidence_id=ev_id, publisher=pub, date=r.get("date"), affects=t.affects or None, provenance="observed",
            )
            signals.append(sig)
            # attach to stops whose name/address contains the affected area (deterministic matching only)
            area = (t.affects or "").lower()
            if area and len(area) > 3:
                for n in nodes:
                    if area in n.name.lower() or area in (n.address or "").lower():
                        n.current_signals.append(sig)
        return signals, evidence

    async def _stay(self, req: JourneyRequest, d: date, dest: Location, ctx: trace.JourneyContext) -> list[StaySuggestion]:
        name = dest.name.split(",")[0]
        data = await _safe(tools.search_hotels(f"hotels in {name}", d.isoformat(), (d + timedelta(days=1)).isoformat(), phase="stay"), ctx, "Hotels")
        out: list[StaySuggestion] = []
        for p in (data or {}).get("properties") or []:
            rate = p.get("rate_per_night") or {}
            g = p.get("gps_coordinates") or {}
            imgs = p.get("images") or []
            out.append(StaySuggestion(
                name=p.get("name", "Hotel"), price_text=rate.get("lowest"), rating=p.get("overall_rating"), link=p.get("link"),
                thumbnail=(imgs[0].get("thumbnail") if imgs and isinstance(imgs[0], dict) else p.get("thumbnail")),
                latitude=g.get("latitude"), longitude=g.get("longitude"), hotel_class=p.get("hotel_class") or p.get("type"),
            ))
        out.sort(key=lambda s: -(s.rating or 0))
        return out[:3]

    async def _flights(self, req: JourneyRequest, d: date, ctx: trace.JourneyContext) -> list[FlightOption]:
        a, b = IATA.get(req.origin.strip().lower().split(",")[0]), IATA.get(req.destination.strip().lower().split(",")[0])
        if not a or not b or a == b:
            return []
        data = await _safe(tools.search_flights(a, b, d.isoformat(), phase="flights"), ctx, "Flights")
        out: list[FlightOption] = []
        for f in ((data or {}).get("best_flights") or []) + ((data or {}).get("other_flights") or []):
            legs = f.get("flights") or []
            if not legs:
                continue
            price = f.get("price")
            out.append(FlightOption(
                airline=legs[0].get("airline"), price_text=(f"₹{price:,}" if isinstance(price, (int, float)) else (str(price) if price else None)),
                duration_min=f.get("total_duration"), departure=(legs[0].get("departure_airport") or {}).get("time"),
                arrival=(legs[-1].get("arrival_airport") or {}).get("time"), stops=max(0, len(legs) - 1),
            ))
        return out[:2]

    # ------------------------------------------------------------------------------------------------ directions refinement / web evidence
    async def refine_legs(self, graph: JourneyGraph, state: PlanState, seq: list[str], ctx: trace.JourneyContext) -> list[str]:
        """Upgrade estimated legs to OBSERVED durations (google_maps_directions), then re-validate the plan.

        Up to 3 rounds: observe the legs of the current plan, and if reality broke something re-optimise with those observed
        legs in the model. An impossible or shaky plan is never shipped — whatever still does not clearly fit is dropped."""
        if not seq:
            return seq
        cfg = MODES[state.mode]

        def pos(i: str) -> tuple[float, float]:
            if i == ORIGIN_ID:
                return graph.origin.latitude, graph.origin.longitude
            if i == DEST_ID:
                return graph.destination.latitude, graph.destination.longitude
            n = graph.nodes[i]
            return n.latitude, n.longitude

        async def one(a: str, b: str):
            data = await _safe(tools.get_directions(pos(a), pos(b), phase="directions"), ctx, "Leg directions")
            parsed = ingest.parse_directions(data) if data else None
            if parsed and parsed["duration_min"]:
                return a, b, parsed["duration_min"]
            return None

        for _ in range(3):
            ids = [ORIGIN_ID, *seq, DEST_ID]
            pairs = [(a, b) for a, b in zip(ids, ids[1:]) if f"{a}|{b}" not in graph.observed_legs]
            for r in await asyncio.gather(*[one(a, b) for a, b in pairs]):
                if r:
                    graph.observed_legs[f"{r[0]}|{r[1]}"] = round(r[2], 1)
            chain = run_chain(graph, seq, state, TravelModel(graph))
            weak = [s.node.id for s in chain.stops if (not s.assessment.valid) or s.assessment.score < MIN_TEMPORAL]
            if not weak and chain.arrive_min <= state.end_by_min:
                return seq
            if not pairs:
                break  # nothing new to learn — fall through to dropping
            try:
                seq = optimize(graph, state, cfg, previous=seq, search_observed=True).sequence
            except InfeasibleRoute:
                break
        chain = run_chain(graph, seq, state, TravelModel(graph))
        keep = [s.node.id for s in chain.stops if s.assessment.valid and s.assessment.score >= MIN_TEMPORAL]
        ch2 = run_chain(graph, keep, state, TravelModel(graph), skip_invalid=True)
        return [s.node.id for s in ch2.stops if s.assessment.score >= MIN_TEMPORAL]

    async def _web_evidence(self, graph: JourneyGraph, seq: list[str], ctx: trace.JourneyContext, mode: str) -> None:
        async def one(nid: str) -> None:
            n = graph.nodes[nid]
            data = await _safe(tools.search_web(f"{n.name} {graph.destination.name.split(',')[0] if n.progress > 0.9 else ''} visiting hours timings".strip(), phase="web", num=5), ctx, f"Web evidence for {n.name}")
            if data:
                ingest.apply_web(n, data, mode)

        top = sorted(seq, key=lambda i: -(graph.nodes[i].scores.total or graph.nodes[i].rating or 0))[:3]
        await asyncio.gather(*[one(i) for i in top])
