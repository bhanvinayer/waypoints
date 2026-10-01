from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..engine.replan import NotFound, place_detail
from ..schemas import Evidence, PlaceDetail
from ..store import get_store

router = APIRouter(prefix="/api/place", tags=["place"])


@router.get("/{place_id}", response_model=PlaceDetail)
async def get_place_detail(place_id: str, journey: str | None = None) -> PlaceDetail:
    try:
        return place_detail(place_id, journey)
    except NotFound:
        raise HTTPException(404, {"code": "not_found", "message": "Place not found — open it from a route.", "retriable": False})


@router.get("/{place_id}/evidence", response_model=list[Evidence])
async def get_place_evidence(place_id: str, journey: str | None = None) -> list[Evidence]:
    found = get_store().find_place(place_id, journey)
    if not found:
        raise HTTPException(404, {"code": "not_found", "message": "Place not found", "retriable": False})
    node, rec = found
    ev = list(node.evidence)
    ev_ids = {e.id for e in ev}
    for sig in node.current_signals:
        for e in rec.response.evidence:
            if e.id == sig.evidence_id and e.id not in ev_ids:
                ev.append(e)
                ev_ids.add(e.id)
    if node.sunset_sensitive:
        sun = next((e for e in rec.response.evidence if e.id == "ev_sunset"), None)
        if sun and sun.id not in ev_ids:
            ev.append(sun)
    return ev
