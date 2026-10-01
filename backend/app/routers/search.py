"""Thin, individually callable SerpApi tool endpoints (also what the LIVE SEARCH TRACE is built from)."""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from fastapi import APIRouter, HTTPException

from .. import trace
from ..config import get_settings
from ..schemas import (
    DirectionsRequest, EventsSearchRequest, FlightsRequest, HotelsRequest, MapsSearchRequest, NewsSearchRequest, WebSearchRequest,
)
from ..serpapi import tools
from ..serpapi.client import SerpApiError

router = APIRouter(prefix="/api/search", tags=["serpapi"])


def _strip(data: dict[str, Any]) -> dict[str, Any]:
    drop = {"search_parameters", "search_metadata", "serpapi_pagination", "api_key"}
    return {k: v for k, v in data.items() if k not in drop}


async def _run(demo: bool, fn: Callable[[], Awaitable[dict[str, Any]]]) -> dict[str, Any]:
    s = get_settings()
    mode = "demo" if demo else "live"
    if mode == "live" and not s.serpapi_configured:
        raise HTTPException(503, {"code": "serpapi_not_configured", "message": "SERPAPI_KEY is not configured on the server.", "retriable": False})
    ctx = trace.JourneyContext(data_mode=mode, max_calls=20)
    with trace.journey_context(ctx):
        try:
            data = await fn()
        except SerpApiError as exc:
            raise HTTPException(502 if exc.retriable else 422, {"code": exc.code, "message": "Live search temporarily unavailable." if exc.retriable else exc.message, "retriable": exc.retriable})
    return {"data": _strip(data), "trace": [t.model_dump() for t in ctx.steps], "mode": mode}


@router.post("/maps")
async def maps(req: MapsSearchRequest):
    return await _run(req.demo, lambda: tools.search_maps(req.query, req.location, req.latitude, req.longitude, req.zoom))


@router.post("/web")
async def web(req: WebSearchRequest):
    return await _run(req.demo, lambda: tools.search_web(req.query, req.location, req.num))


@router.post("/news")
async def news(req: NewsSearchRequest):
    return await _run(req.demo, lambda: tools.search_news(req.query))


@router.post("/events")
async def events(req: EventsSearchRequest):
    return await _run(req.demo, lambda: tools.search_events(req.query, req.location, req.date_filter))


@router.post("/directions")
async def directions(req: DirectionsRequest):
    return await _run(req.demo, lambda: tools.get_directions(req.start, req.end))


@router.post("/flights")
async def flights(req: FlightsRequest):
    return await _run(req.demo, lambda: tools.search_flights(req.departure_id, req.arrival_id, req.outbound_date))


@router.post("/hotels")
async def hotels(req: HotelsRequest):
    return await _run(req.demo, lambda: tools.search_hotels(req.query, req.check_in_date, req.check_out_date, req.adults))
