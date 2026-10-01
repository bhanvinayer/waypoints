"""Strict data contract for WAYPOINTS.

Every factual field carries a provenance so the UI (and the judges) can tell apart:
  observed  - returned by SerpApi (Maps / Reviews / Events / News / Search ...)
  inferred  - deterministic arithmetic over observed data ("30 minutes left")
  simulated - a what-if scenario ("if you are delayed 45 minutes ...")
  user      - typed in by the traveller
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Provenance = Literal["observed", "inferred", "simulated", "user"]
RouteMode = Literal["fastest", "experience", "food_trail", "scenic", "discovery"]
TemporalStatus = Literal[
    "IDEAL_WINDOW",
    "OPEN_AT_ARRIVAL",
    "CLOSING_TOO_SOON",
    "NOT_OPEN",
    "EVENT_CONFLICT",
    "WINDOW_MISSED",
    "UNKNOWN_HOURS",
]
Role = Literal[
    "meal", "snack", "heritage", "museum", "viewpoint", "nature", "market", "event",
    "nightlife", "religious", "activity", "other",
]
Tone = Literal["green", "yellow", "red", "gray"]
DataMode = Literal["live", "demo"]

ROUTE_MODES: list[str] = ["fastest", "experience", "food_trail", "scenic", "discovery"]


class Model(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


# ---------------------------------------------------------------- primitives
class Location(Model):
    name: str
    latitude: float
    longitude: float
    address: Optional[str] = None
    source: str = "google_maps"


class OpeningInterval(Model):
    day: int  # 0 = Monday
    open_min: int  # minutes after midnight
    close_min: int  # may exceed 1440 for overnight venues


class ExperienceWindow(Model):
    kind: Literal["event", "sunset"]
    start_min: int
    end_min: int
    label: str
    evidence_id: Optional[str] = None
    provenance: Provenance = "observed"


class EventInfo(Model):
    title: str
    start_min: Optional[int] = None
    end_min: Optional[int] = None
    when_text: Optional[str] = None
    venue: Optional[str] = None
    address: Optional[str] = None
    link: Optional[str] = None
    thumbnail: Optional[str] = None
    source: str = "google_events"


class Evidence(Model):
    id: str
    kind: Literal["maps", "reviews", "search", "news", "event", "directions", "computed", "hotel", "flight"]
    title: str
    detail: str = ""
    source: str  # SerpApi engine or "waypoints_engine"
    provenance: Provenance = "observed"
    url: Optional[str] = None
    publisher: Optional[str] = None
    date: Optional[str] = None  # date as reported by the source
    retrieved_at: Optional[str] = None
    node_id: Optional[str] = None
    mode: DataMode = "live"


class CurrentSignal(Model):
    id: str
    kind: Literal["event", "news", "sunset", "closure", "crowd"]
    title: str
    detail: str = ""
    severity: Literal["info", "watch", "warn"] = "info"
    evidence_id: Optional[str] = None
    publisher: Optional[str] = None
    date: Optional[str] = None
    affects: Optional[str] = None
    start_min: Optional[int] = None
    end_min: Optional[int] = None
    provenance: Provenance = "observed"


class ReviewSignal(Model):
    theme: str
    sentiment: Literal["positive", "negative", "neutral"] = "neutral"
    snippet: str
    rating: Optional[float] = None
    date: Optional[str] = None


class Risk(Model):
    code: str
    label: str
    severity: Literal["low", "medium", "high"] = "low"
    provenance: Provenance = "inferred"


class Reason(Model):
    status: Literal["pass", "warn", "fail"]
    text: str
    provenance: Provenance = "inferred"


class ScoreBreakdown(Model):
    preference_fit: float = 0.0
    temporal_fit: float = 0.0
    route_fit: float = 0.0
    quality: float = 0.0
    evidence: float = 0.0
    current_relevance: float = 0.5
    total: float = 0.0  # 0..100 waypoint score


class TemporalAssessment(Model):
    status: TemporalStatus
    score: float  # 0..1
    arrival_min: int
    start_min: int  # when the experience actually starts (after any waiting)
    depart_min: int
    wait_min: int = 0
    slack_min: Optional[int] = None  # time left between the end of the visit and the window closing
    window_start_min: Optional[int] = None
    window_end_min: Optional[int] = None
    reason: str = ""
    valid: bool = True
    provenance: Provenance = "inferred"


# ---------------------------------------------------------------- the graph
class ExperienceNode(Model):
    id: str
    source_id: Optional[str] = None
    data_id: Optional[str] = None
    place_id: Optional[str] = None
    name: str
    kind: Literal["place", "event"] = "place"
    latitude: float
    longitude: float
    address: Optional[str] = None
    thumbnail: Optional[str] = None
    link: Optional[str] = None
    description: Optional[str] = None

    category: list[str] = Field(default_factory=list)
    role: Role = "other"
    rating: Optional[float] = None
    review_count: Optional[int] = None
    price_level: Optional[int] = None
    price_text: Optional[str] = None

    opening_hours: list[OpeningInterval] = Field(default_factory=list)
    hours_known: bool = False
    hours_text: dict[str, str] = Field(default_factory=dict)  # day -> text as reported
    open_state: Optional[str] = None  # "Open ⋅ Closes 8 pm" (state at query time, not at arrival)
    estimated_visit_minutes: int = 45
    visit_minutes_source: Provenance = "inferred"
    windows: list[ExperienceWindow] = Field(default_factory=list)
    sunset_sensitive: bool = False
    hidden_gem: bool = False
    matched_interests: list[str] = Field(default_factory=list)
    pref_adjust: float = 0.0  # Experience Curator nudge, clamped to +/-0.1

    # geometry relative to the route
    progress: float = 0.0
    progress_km: float = 0.0
    lateral_km: float = 0.0
    access_minutes: float = 0.0
    axis_t: float = 0.0

    # journey-specific numbers (filled by the engine, never globally)
    route_detour_minutes: float = 0.0
    route_detour_km: float = 0.0
    detour_cost_inr: float = 0.0
    travel_from_previous_minutes: float = 0.0
    travel_source: Provenance = "inferred"
    temporal: Optional[TemporalAssessment] = None
    scores: ScoreBreakdown = Field(default_factory=ScoreBreakdown)
    reliability_score: float = 0.0

    current_signals: list[CurrentSignal] = Field(default_factory=list)
    reviews: list[ReviewSignal] = Field(default_factory=list)
    events: list[EventInfo] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    failure_risks: list[Risk] = Field(default_factory=list)
    fallback_options: list[str] = Field(default_factory=list)  # node ids
    reasons: list[Reason] = Field(default_factory=list)
    one_liner: Optional[str] = None


class Waypoint(ExperienceNode):
    order: int = 0
    arrival_min: int = 0
    start_min: int = 0
    depart_min: int = 0
    wait_min: int = 0
    tone: Tone = "green"
    slack_min: Optional[int] = None


class TimelineItem(Model):
    id: str
    kind: Literal["start", "drive", "stop", "end", "delay"]
    start_min: int
    end_min: int
    title: str
    subtitle: str = ""
    node_id: Optional[str] = None
    detour_min: Optional[float] = None
    tone: Tone = "green"
    provenance: Provenance = "inferred"


class CorridorTown(Model):
    name: str
    latitude: float
    longitude: float
    progress: float
    lateral_km: float
    verified: bool = True
    source: str = "google_maps"


class Route(Model):
    distance_km: float
    duration_min: float
    polyline: list[list[float]]
    via: Optional[str] = None
    geometry_source: Literal["serpapi_directions", "estimated_straight", "demo_snapshot"] = "serpapi_directions"
    corridor: list[CorridorTown] = Field(default_factory=list)


class Robustness(Model):
    score: int
    label: str
    explanation: str
    delay_survival: float = 0.0
    buffer: float = 0.0
    fallback_cover: float = 0.0
    window_flex: float = 0.0
    min_slack_min: Optional[int] = None
    weakest_stop_id: Optional[str] = None
    tested: list[dict[str, Any]] = Field(default_factory=list)
    provenance: Provenance = "simulated"


class RouteOption(Model):
    mode: RouteMode
    label: str
    tagline: str
    travel_minutes: int
    stops: int
    total_minutes: int
    detour_minutes: int
    arrive_min: int
    robustness: int
    stop_names: list[str] = Field(default_factory=list)
    selected: bool = False


class StaySuggestion(Model):
    name: str
    price_text: Optional[str] = None
    rating: Optional[float] = None
    link: Optional[str] = None
    thumbnail: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    hotel_class: Optional[str] = None
    source: str = "google_hotels"


class FlightOption(Model):
    airline: Optional[str] = None
    price_text: Optional[str] = None
    duration_min: Optional[int] = None
    departure: Optional[str] = None
    arrival: Optional[str] = None
    stops: int = 0
    source: str = "google_flights"


class Narrative(Model):
    headline: str
    summary: str
    highlights: list[str] = Field(default_factory=list)
    engine: Literal["groq", "rule-based"] = "rule-based"


class RouteChange(Model):
    kind: Literal["start_time", "mode", "replace", "remove", "add", "recovery", "disruption"]
    title: str
    message: str
    removed: list[dict[str, Any]] = Field(default_factory=list)
    added: list[dict[str, Any]] = Field(default_factory=list)
    retimed: list[dict[str, Any]] = Field(default_factory=list)
    why: Optional[str] = None


class PlanState(Model):
    """Everything that parameterises the plan on top of the (immutable) graph."""

    mode: RouteMode = "experience"
    start_min: int = 480
    end_by_min: int = 1260
    delay_min: int = 0
    event_shift_min: int = 0
    excluded_ids: list[str] = Field(default_factory=list)
    forced_ids: list[str] = Field(default_factory=list)
    closed_ids: list[str] = Field(default_factory=list)
    overruns: dict[str, int] = Field(default_factory=dict)  # stop_id -> extra minutes spent there (what-if)


# ---------------------------------------------------------------- requests
class JourneyRequest(Model):
    origin: str
    destination: str
    date: str  # ISO date, or a weekday name ("Saturday")
    start_time: str = "08:00"
    interests: list[str] = Field(default_factory=list)
    travel_style: str = "experience"
    travel_styles: list[str] = Field(default_factory=list)
    budget: Optional[str] = None
    end_time: Optional[str] = None
    mode: Optional[RouteMode] = None
    demo: Optional[bool] = None
    max_detour_minutes: Optional[int] = None
    include_stay: bool = True


class StressRequest(Model):
    journey_id: str
    scenario: Literal["delay", "flight_delay", "stop_overrun", "stop_closed", "event_delayed", "skip_stop"] = "delay"
    minutes: int = 45
    stop_id: Optional[str] = None


class ReplanRequest(Model):
    journey_id: str
    start_time: Optional[str] = None
    mode: Optional[RouteMode] = None
    replace_stop_id: Optional[str] = None
    remove_stop_id: Optional[str] = None
    add_place_id: Optional[str] = None
    apply_recovery: Optional[StressRequest] = None
    reset_disruptions: bool = False


class SegmentDiscoverRequest(Model):
    journey_id: str
    from_fraction: float = 0.0
    to_fraction: float = 1.0
    count: int = 5


class AnalyzeResponse(Model):
    interests: list[str]
    styles: list[str]
    wants: dict[str, bool]
    pace: str
    recommended_mode: RouteMode
    notes: str
    engine: Literal["groq", "rule-based"]
    corridor_hints: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------- responses
class TraceStep(Model):
    id: str
    phase: str
    kind: Literal["serpapi", "llm", "engine"]
    label: str
    engine: Optional[str] = None
    query: Optional[str] = None
    latency_ms: int = 0
    results: Optional[int] = None
    cached: bool = False
    ok: bool = True
    error: Optional[str] = None
    started_at: str = ""
    mode: str = "live"
    detail: Optional[str] = None


class SliceNode(Model):
    id: str
    name: str
    fit: float
    status: TemporalStatus
    tone: Tone
    in_route: bool
    reason: str
    role: str


class SliceResponse(Model):
    minute: int
    nodes: list[SliceNode]
    relevant_now: list[str]
    unavailable_now: list[str]
    summary: str


class JourneyResponse(Model):
    journey_id: str
    version: int = 1
    created_at: str
    data_mode: DataMode
    request: JourneyRequest
    mode: RouteMode
    state: PlanState
    origin: Location
    destination: Location
    route: Route
    waypoints: list[Waypoint]
    timeline: list[TimelineItem]
    evidence: list[Evidence]
    signals: list[CurrentSignal]
    robustness: Robustness
    alternatives: list[ExperienceNode]
    pool: list[ExperienceNode]
    route_options: list[RouteOption]
    narrative: Narrative
    sunset_min: Optional[int] = None
    stay: list[StaySuggestion] = Field(default_factory=list)
    flights: list[FlightOption] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    change: Optional[RouteChange] = None
    original_waypoint_ids: list[str] = Field(default_factory=list)
    trace: list[TraceStep] = Field(default_factory=list)
    total_travel_minutes: int = 0
    total_detour_minutes: int = 0
    arrive_min: int = 0
    direct_minutes: int = 0


class StressStop(Model):
    stop_id: str
    name: str
    role: str
    before_arrival_min: int
    before_status: TemporalStatus
    before_tone: Tone
    after_arrival_min: Optional[int] = None
    after_status: Optional[TemporalStatus] = None
    after_tone: Tone
    after_reason: str = ""
    before_slack_min: Optional[int] = None
    after_slack_min: Optional[int] = None
    skipped: bool = False


class RecoveryOp(Model):
    type: Literal["replace", "drop"]
    removed_id: str
    removed_name: str
    added: Optional[ExperienceNode] = None
    reason: str
    why: str = ""
    arrival_min: Optional[int] = None
    status: Optional[TemporalStatus] = None
    detour_min: Optional[float] = None
    extra_travel_min: Optional[float] = None
    score: Optional[float] = None


class RecoveryPlan(Model):
    ops: list[RecoveryOp]
    new_sequence: list[str]
    new_waypoints: list[Waypoint]
    new_timeline: list[TimelineItem]
    extra_travel_minutes: int
    experiences_preserved: int
    experiences_total: int
    arrive_before_min: int
    arrive_after_min: int
    fully_recovered: bool
    narrative: str
    narrative_engine: Literal["groq", "rule-based"] = "rule-based"


class StressResult(Model):
    scenario: str
    label: str
    minutes: int
    stop_id: Optional[str] = None
    applicable: bool = True
    note: Optional[str] = None
    verdict: Literal["SURVIVED", "BREAK_DETECTED"]
    outcome: Literal["SURVIVED", "RECOVERED", "PARTIALLY_RECOVERED", "NOT_RECOVERABLE"]
    headline: str
    stops: list[StressStop]
    broken: int
    at_risk: int
    recovery: Optional[RecoveryPlan] = None
    robustness_before: int
    robustness_after: Optional[int] = None
    explanation: str
    explanation_engine: Literal["groq", "rule-based"] = "rule-based"
    provenance: Provenance = "simulated"


class ReplanResponse(Model):
    journey: JourneyResponse
    change: RouteChange


class SegmentDiscoverResponse(Model):
    from_fraction: float
    to_fraction: float
    candidates: list[ExperienceNode]
    note: Optional[str] = None


class PlaceDetail(Model):
    node: ExperienceNode
    journey_id: Optional[str] = None
    in_route: bool = False
    fit_by_hour: list[dict[str, Any]] = Field(default_factory=list)


class StageInfo(Model):
    key: str
    label: str
    status: Literal["pending", "running", "done", "error", "skipped"] = "pending"
    detail: Optional[str] = None
    started_at: Optional[str] = None
    duration_ms: Optional[int] = None


class JobInfo(Model):
    id: str
    status: Literal["running", "done", "error"]
    stages: list[StageInfo]
    journey_id: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    retriable: bool = False
    data_mode: DataMode = "live"


# ---------------------------------------------------------------- raw search endpoints
class MapsSearchRequest(Model):
    query: str
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    zoom: int = 13
    demo: bool = False


class WebSearchRequest(Model):
    query: str
    location: Optional[str] = None
    num: int = 8
    demo: bool = False


class NewsSearchRequest(Model):
    query: str
    demo: bool = False


class EventsSearchRequest(Model):
    query: str
    location: Optional[str] = None
    date_filter: Optional[str] = None  # today | tomorrow | week | weekend | next_week | month
    demo: bool = False


class DirectionsRequest(Model):
    start: str
    end: str
    demo: bool = False


class FlightsRequest(Model):
    departure_id: str
    arrival_id: str
    outbound_date: str
    demo: bool = False


class HotelsRequest(Model):
    query: str
    check_in_date: str
    check_out_date: str
    adults: int = 2
    demo: bool = False
