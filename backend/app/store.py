"""Journey persistence. In-memory with a JSON file per journey so plans survive a server restart.

(PostgreSQL is deliberately not required: a journey is a self-contained snapshot of evidence + graph.)
"""
from __future__ import annotations

import threading
from pathlib import Path

from .config import get_settings
from .engine.graph import JourneyGraph
from .schemas import ExperienceNode, JobInfo, JourneyResponse, Model, PlanState


class JourneyRecord(Model):
    id: str
    response: JourneyResponse
    graph: JourneyGraph
    state: PlanState
    sequence: list[str]


class JourneyStore:
    def __init__(self, directory: Path | None = None):
        self.dir = directory or (get_settings().data_dir / "journeys")
        self.dir.mkdir(parents=True, exist_ok=True)
        self._mem: dict[str, JourneyRecord] = {}
        self._jobs: dict[str, JobInfo] = {}
        self._lock = threading.Lock()

    def put(self, rec: JourneyRecord) -> None:
        with self._lock:
            self._mem[rec.id] = rec
        try:
            (self.dir / f"{rec.id}.json").write_text(rec.model_dump_json(), encoding="utf-8")
        except Exception:
            pass

    def get(self, journey_id: str) -> JourneyRecord | None:
        if not journey_id.replace("-", "").replace("_", "").isalnum():
            return None
        with self._lock:
            hit = self._mem.get(journey_id)
        if hit:
            return hit
        path = self.dir / f"{journey_id}.json"
        if path.exists():
            try:
                rec = JourneyRecord.model_validate_json(path.read_text(encoding="utf-8"))
                with self._lock:
                    self._mem[journey_id] = rec
                return rec
            except Exception:
                return None
        return None

    def find_place(self, place_id: str, journey_id: str | None = None) -> tuple[ExperienceNode, JourneyRecord] | None:
        if journey_id:
            rec = self.get(journey_id)
            if rec and place_id in rec.graph.nodes:
                return rec.graph.nodes[place_id], rec
        with self._lock:
            recs = list(self._mem.values())
        for rec in reversed(recs):
            if place_id in rec.graph.nodes:
                return rec.graph.nodes[place_id], rec
        return None

    # ---- jobs (discovery progress)
    def put_job(self, job: JobInfo) -> None:
        with self._lock:
            self._jobs[job.id] = job

    def get_job(self, job_id: str) -> JobInfo | None:
        with self._lock:
            return self._jobs.get(job_id)


_store: JourneyStore | None = None


def get_store() -> JourneyStore:
    global _store
    if _store is None:
        _store = JourneyStore()
    return _store


def set_store(store: JourneyStore | None) -> None:
    global _store
    _store = store
