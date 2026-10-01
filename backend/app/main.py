from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .llm.groq_client import get_groq
from .routers import journey, place, search
from .serpapi.client import get_serp_client
from .store import get_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_store()
    yield
    await get_serp_client().aclose()
    await get_groq().aclose()


app = FastAPI(
    title="WAYPOINTS - Temporal Route Intelligence",
    version="1.0.0",
    description=(
        "Discover, validate, stress-test and repair journeys over a Temporal Experience Graph. "
        "SerpApi is the live evidence layer; Groq (open-source LLMs) reasons over it."
    ),
    lifespan=lifespan,
)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(journey.router)
app.include_router(search.router)
app.include_router(place.router)


@app.get("/api/health", tags=["meta"])
async def health() -> dict:
    s = get_settings()
    return {
        "status": "ok",
        "serpapi_configured": s.serpapi_configured,
        "groq_configured": s.groq_configured,
        "groq_model": s.groq_model,
        "demo_available": True,
        "demo_default": s.demo_mode,
        "engines": ["google_maps", "google_maps_reviews", "google_maps_directions", "google", "google_news", "google_events", "google_flights", "google_hotels"],
    }


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": {"code": "internal", "message": "Something went wrong on our side.", "retriable": True}})


# Optional: serve the built frontend (npm run build) from the same process.
_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        f = _dist / full_path
        if full_path and f.is_file():
            return FileResponse(f)
        return FileResponse(_dist / "index.html")

