import os
import sys
import tempfile
from pathlib import Path

# Isolated, key-less environment: tests never touch the network or the developer's real data.
_tmp = tempfile.mkdtemp(prefix="waypoints-test-")
os.environ["WAYPOINTS_DATA_DIR"] = _tmp
os.environ["SERPAPI_KEY"] = ""
os.environ["GROQ_API_KEY"] = ""
os.environ["DEMO_MODE"] = "false"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

from app.config import reset_settings  # noqa: E402
from app.schemas import JourneyRequest  # noqa: E402


@pytest.fixture(autouse=True)
def _settings():
    reset_settings()
    yield


@pytest.fixture
def demo_request() -> JourneyRequest:
    return JourneyRequest(
        origin="Delhi", destination="Jaipur", date="2026-10-03", start_time="08:00",
        interests=["Street Food", "Architecture"], travel_styles=["food", "photography", "culture"], demo=True,
    )


@pytest.fixture
async def demo_journey(demo_request):
    from app.engine.orchestrator import SearchOrchestrator

    return await SearchOrchestrator().discover(demo_request)
