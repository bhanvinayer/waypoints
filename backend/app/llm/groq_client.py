"""Groq (open-source LLMs, OpenAI-compatible endpoint) — used to *reason over* retrieved SerpApi evidence.

The LLM never supplies facts. Every agent hands it structured evidence and validates what comes back
(ids must exist, numbers must be grounded in the evidence, enums must be in range). On any failure the agent falls
back to deterministic rules, and the LIVE SEARCH TRACE records which engine actually produced the result.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from typing import Any

import httpx

from .. import trace
from ..config import Settings, get_settings
from ..schemas import TraceStep

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqClient:
    def __init__(self, settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings or get_settings()
        self._transport = transport
        self._http: httpx.AsyncClient | None = None
        self._cache: dict[str, dict[str, Any]] = {}

    @property
    def available(self) -> bool:
        return self.settings.groq_configured

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=httpx.Timeout(28.0, connect=8.0), transport=self._transport)
        return self._http

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def chat_json(
        self,
        agent: str,
        system: str,
        user: Any,
        *,
        max_tokens: int = 900,
        temperature: float = 0.0,
        phase: str = "reason",
        label: str | None = None,
    ) -> dict[str, Any] | None:
        """Returns parsed JSON, or None when Groq is unavailable/failed (caller must fall back)."""
        step = TraceStep(
            id=trace.new_step_id(), phase=phase, kind="llm", label=label or agent, engine=f"groq:{self.settings.groq_model}",
            started_at=trace.now_iso(), mode="groq",
        )
        t0 = time.perf_counter()
        if not self.available:
            step.mode = "rule-based"
            step.detail = "GROQ_API_KEY not set — deterministic rules used"
            step.latency_ms = 0
            trace.current().add(step)
            return None
        payload = user if isinstance(user, str) else json.dumps(user, ensure_ascii=False, separators=(",", ":"))
        key = hashlib.sha1(f"{self.settings.groq_model}|{agent}|{system}|{payload}".encode()).hexdigest()
        if key in self._cache:
            step.cached = True
            step.detail = "cached LLM result"
            trace.current().add(step)
            return self._cache[key]
        body = {
            "model": self.settings.groq_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": payload}],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
        headers = {"Authorization": f"Bearer {self.settings.groq_api_key}", "Content-Type": "application/json"}
        err: str | None = None
        data: dict[str, Any] | None = None
        for attempt in range(2):
            try:
                resp = await self._client().post(GROQ_URL, json=body, headers=headers)
                if resp.status_code == 429 and attempt == 0:
                    await asyncio.sleep(1.5)
                    continue
                if resp.status_code != 200:
                    err = f"Groq HTTP {resp.status_code}"
                    break
                content = resp.json()["choices"][0]["message"]["content"]
                data = _loads(content)
                if data is None:
                    err = "Groq returned non-JSON content"
                break
            except Exception as exc:  # network / parse
                err = f"Groq request failed: {exc.__class__.__name__}"
                await asyncio.sleep(0.4)
        step.latency_ms = int((time.perf_counter() - t0) * 1000)
        if data is None:
            step.ok = False
            step.error = err or "unknown error"
            step.mode = "rule-based"
            step.detail = "fell back to deterministic rules"
            trace.current().add(step)
            return None
        step.results = len(data)
        trace.current().add(step)
        self._cache[key] = data
        return data


def _loads(text: str) -> dict[str, Any] | None:
    try:
        v = json.loads(text)
        return v if isinstance(v, dict) else None
    except Exception:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                v = json.loads(m.group(0))
                return v if isinstance(v, dict) else None
            except Exception:
                return None
    return None


_groq: GroqClient | None = None


def get_groq() -> GroqClient:
    global _groq
    if _groq is None:
        _groq = GroqClient()
    return _groq


def set_groq(client: GroqClient | None) -> None:
    global _groq
    _groq = client
