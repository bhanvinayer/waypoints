from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, HTTPException, Query

from .. import trace
from ..engine.orchestrator import DiscoveryError, Progress, SearchOrchestrator
from ..engine.replan import NotFound, PlanError, replan, segment_discover, slice_at, stress
from ..llm import agents
from ..schemas import (
    AnalyzeResponse, JobInfo, JourneyRequest, JourneyResponse, ReplanRequest, ReplanResponse, SegmentDiscoverRequest,
    SegmentDiscoverResponse, SliceResponse, StressRequest, StressResult,
)
from ..store import get_store

router = APIRouter(prefix="/api/journey", tags=["journey"])
_tasks: set[asyncio.Task] = set()


def _err(exc: DiscoveryError) -> HTTPException:
    return HTTPException(status_code=503 if exc.retriable else 422, detail={"code": exc.code, "message": exc.message, "retriable": exc.retriable})


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: JourneyRequest) -> AnalyzeResponse:
    orch = SearchOrchestrator()
    try:
        _, start, end = orch.resolve_times(req)
    except ValueError as exc:
        raise HTTPException(422, {"code": "bad_request", "message": str(exc), "retriable": False})
    with trace.journey_context(trace.JourneyContext(data_mode=orch.data_mode(req))):
        return await agents.journey_analyst(req, start, end)


@router.post("/discover", response_model=JourneyResponse)
async def discover(req: JourneyRequest) -> JourneyResponse:
    try:
        return await SearchOrchestrator().discover(req)
    except DiscoveryError as exc:
        raise _err(exc)


@router.post("/discover/start", response_model=JobInfo)
async def discover_start(req: JourneyRequest) -> JobInfo:
    """Starts discovery in the background; poll GET /api/journey/jobs/{id} for REAL per-stage progress."""
    orch = SearchOrchestrator()
    job_id = uuid.uuid4().hex[:12]
    progress = Progress(job_id, orch.data_mode(req))

    async def run() -> None:
        try:
            await orch.discover(req, progress, journey_id=job_id)
        except DiscoveryError as exc:
            for s in progress.job.stages:
                if s.status == "running":
                    s.status = "error"
                    s.detail = exc.message
            progress.error(exc)
        except Exception as exc:  # pragma: no cover - surfaced to the client, never swallowed silently
            for s in progress.job.stages:
                if s.status == "running":
                    s.status = "error"
            progress.error(DiscoveryError(f"Unexpected error: {exc.__class__.__name__}: {exc}", "internal", True))

    task = asyncio.create_task(run())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return progress.job


@router.get("/jobs/{job_id}", response_model=JobInfo)
async def job_status(job_id: str) -> JobInfo:
    job = get_store().get_job(job_id)
    if not job:
        raise HTTPException(404, {"code": "not_found", "message": "Unknown job", "retriable": False})
    return job


@router.post("/stress-test", response_model=StressResult)
async def stress_test(req: StressRequest) -> StressResult:
    try:
        return await stress(req)
    except NotFound as exc:
        raise HTTPException(404, {"code": "not_found", "message": str(exc), "retriable": False})


@router.post("/replan", response_model=ReplanResponse)
async def replan_route(req: ReplanRequest) -> ReplanResponse:
    try:
        return await replan(req)
    except NotFound as exc:
        raise HTTPException(404, {"code": "not_found", "message": str(exc), "retriable": False})
    except PlanError as exc:
        raise HTTPException(409 if exc.code != "bad_request" else 422, {"code": exc.code, "message": exc.message, "retriable": False})


@router.post("/segment-discover", response_model=SegmentDiscoverResponse)
async def segment(req: SegmentDiscoverRequest) -> SegmentDiscoverResponse:
    try:
        return await segment_discover(req)
    except NotFound as exc:
        raise HTTPException(404, {"code": "not_found", "message": str(exc), "retriable": False})


@router.get("/{journey_id}", response_model=JourneyResponse)
async def get_journey(journey_id: str) -> JourneyResponse:
    rec = get_store().get(journey_id)
    if not rec:
        raise HTTPException(404, {"code": "not_found", "message": "Journey not found — it may have expired. Build the route again.", "retriable": False})
    return rec.response


@router.get("/{journey_id}/slice", response_model=SliceResponse)
async def get_slice(journey_id: str, minute: int = Query(..., ge=0, le=1800)) -> SliceResponse:
    try:
        return slice_at(journey_id, minute)
    except NotFound as exc:
        raise HTTPException(404, {"code": "not_found", "message": str(exc), "retriable": False})
