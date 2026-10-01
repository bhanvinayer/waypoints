"""Per-journey execution context: the LIVE SEARCH TRACE, SerpApi call budget and data mode."""
from __future__ import annotations

import contextvars
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterator, Optional

from .schemas import TraceStep


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class JourneyContext:
    data_mode: str = "live"  # "live" | "demo"
    max_calls: int = 70
    calls: int = 0
    steps: list[TraceStep] = field(default_factory=list)
    journey_date: Optional[str] = None  # ISO date, used by the demo backend to date events
    warnings: list[str] = field(default_factory=list)

    def add(self, step: TraceStep) -> TraceStep:
        self.steps.append(step)
        return step

    def warn(self, message: str) -> None:
        if message not in self.warnings:
            self.warnings.append(message)


_current: contextvars.ContextVar[Optional[JourneyContext]] = contextvars.ContextVar("journey_ctx", default=None)


def current() -> JourneyContext:
    ctx = _current.get()
    if ctx is None:
        ctx = JourneyContext()
        _current.set(ctx)
    return ctx


@contextmanager
def journey_context(ctx: JourneyContext) -> Iterator[JourneyContext]:
    token = _current.set(ctx)
    try:
        yield ctx
    finally:
        _current.reset(token)


def new_step_id() -> str:
    return uuid.uuid4().hex[:8]


class StepTimer:
    """Records a non-SerpApi step (LLM call or deterministic engine stage) into the trace."""

    def __init__(self, phase: str, label: str, kind: str = "engine", engine: str | None = None, query: str | None = None, mode: str | None = None):
        self.step = TraceStep(
            id=new_step_id(),
            phase=phase,
            kind=kind,  # type: ignore[arg-type]
            label=label,
            engine=engine,
            query=query,
            started_at=now_iso(),
            mode=mode or ("rule-based" if kind == "engine" else current().data_mode),
        )
        self._t0 = time.perf_counter()

    def finish(self, results: int | None = None, ok: bool = True, error: str | None = None, detail: str | None = None, mode: str | None = None) -> TraceStep:
        self.step.latency_ms = int((time.perf_counter() - self._t0) * 1000)
        self.step.results = results
        self.step.ok = ok
        self.step.error = error
        self.step.detail = detail
        if mode:
            self.step.mode = mode
        current().add(self.step)
        return self.step
