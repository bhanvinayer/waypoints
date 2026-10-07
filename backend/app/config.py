from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / ".env")


def _bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    serpapi_key: str = field(default_factory=lambda: os.getenv("SERPAPI_KEY", "").strip())
    groq_api_key: str = field(default_factory=lambda: os.getenv("GROQ_API_KEY", "").strip())
    groq_model: str = field(default_factory=lambda: os.getenv("GROQ_MODEL", "openai/gpt-oss-20b").strip())
    demo_mode: bool = field(default_factory=lambda: _bool("DEMO_MODE", False))
    max_calls_per_journey: int = field(default_factory=lambda: int(os.getenv("SERPAPI_MAX_CALLS_PER_JOURNEY", "70")))
    cors_origins: list[str] = field(
        default_factory=lambda: [
            o.strip()
            for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if o.strip()
        ]
    )
    gl: str = field(default_factory=lambda: os.getenv("SERPAPI_GL", "in"))
    hl: str = field(default_factory=lambda: os.getenv("SERPAPI_HL", "en"))
    currency: str = field(default_factory=lambda: os.getenv("SERPAPI_CURRENCY", "INR"))
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("WAYPOINTS_DATA_DIR", str(BACKEND_DIR / ".data"))))

    @property
    def serpapi_configured(self) -> bool:
        return bool(self.serpapi_key)

    @property
    def groq_configured(self) -> bool:
        return bool(self.groq_api_key)


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
        _settings.data_dir.mkdir(parents=True, exist_ok=True)
    return _settings


def reset_settings() -> Settings:
    """Re-read the environment (used by tests)."""
    global _settings
    _settings = None
    return get_settings()
