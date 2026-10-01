// Mirrors backend/app/schemas.py (snake_case end-to-end).

export type Provenance = "observed" | "inferred" | "simulated" | "user";
export type RouteMode = "fastest" | "experience" | "food_trail" | "scenic" | "discovery";
export type TemporalStatus =
  | "IDEAL_WINDOW"
  | "OPEN_AT_ARRIVAL"
  | "CLOSING_TOO_SOON"
  | "NOT_OPEN"
  | "EVENT_CONFLICT"
  | "WINDOW_MISSED"
  | "UNKNOWN_HOURS";
export type Role =
  | "meal" | "snack" | "heritage" | "museum" | "viewpoint" | "nature" | "market"
  | "event" | "nightlife" | "religious" | "activity" | "other";
export type Tone = "green" | "yellow" | "red" | "gray";
export type DataMode = "live" | "demo";

export interface Location { name: string; latitude: number; longitude: number; address?: string | null; source: string }

export interface Evidence {
  id: string;
  kind: "maps" | "reviews" | "search" | "news" | "event" | "directions" | "computed" | "hotel" | "flight";
  title: string;
  detail: string;
  source: string;
  provenance: Provenance;
  url?: string | null;
  publisher?: string | null;
  date?: string | null;
  retrieved_at?: string | null;
  node_id?: string | null;
  mode: DataMode;
}

export interface CurrentSignal {
  id: string;
  kind: "event" | "news" | "sunset" | "closure" | "crowd";
  title: string;
  detail: string;
  severity: "info" | "watch" | "warn";
  evidence_id?: string | null;
  publisher?: string | null;
  date?: string | null;
  affects?: string | null;
  start_min?: number | null;
  end_min?: number | null;
  provenance: Provenance;
}

export interface ReviewSignal { theme: string; sentiment: "positive" | "negative" | "neutral"; snippet: string; rating?: number | null; date?: string | null }
export interface Risk { code: string; label: string; severity: "low" | "medium" | "high"; provenance: Provenance }
export interface Reason { status: "pass" | "warn" | "fail"; text: string; provenance: Provenance }
export interface ScoreBreakdown { preference_fit: number; temporal_fit: number; route_fit: number; quality: number; evidence: number; current_relevance: number; total: number }

export interface TemporalAssessment {
  status: TemporalStatus;
  score: number;
  arrival_min: number;
  start_min: number;
  depart_min: number;
  wait_min: number;
  slack_min?: number | null;
  window_start_min?: number | null;
  window_end_min?: number | null;
  reason: string;
  valid: boolean;
  provenance: Provenance;
}

export interface OpeningInterval { day: number; open_min: number; close_min: number }
export interface ExperienceWindow { kind: "event" | "sunset"; start_min: number; end_min: number; label: string }
export interface EventInfo { title: string; start_min?: number | null; end_min?: number | null; when_text?: string | null; venue?: string | null; link?: string | null }

export interface ExperienceNode {
  id: string;
  name: string;
  kind: "place" | "event";
  latitude: number;
  longitude: number;
  address?: string | null;
  thumbnail?: string | null;
  link?: string | null;
  description?: string | null;
  category: string[];
  role: Role;
  rating?: number | null;
  review_count?: number | null;
  price_level?: number | null;
  price_text?: string | null;
  opening_hours: OpeningInterval[];
  hours_known: boolean;
  hours_text: Record<string, string>;
  open_state?: string | null;
  estimated_visit_minutes: number;
  visit_minutes_source: Provenance;
  windows: ExperienceWindow[];
  sunset_sensitive: boolean;
  hidden_gem: boolean;
  matched_interests: string[];
  progress: number;
  progress_km: number;
  lateral_km: number;
  route_detour_minutes: number;
  route_detour_km: number;
  detour_cost_inr: number;
  travel_from_previous_minutes: number;
  travel_source: Provenance;
  temporal?: TemporalAssessment | null;
  scores: ScoreBreakdown;
  current_signals: CurrentSignal[];
  reviews: ReviewSignal[];
  events: EventInfo[];
  evidence: Evidence[];
  failure_risks: Risk[];
  fallback_options: string[];
  reasons: Reason[];
  one_liner?: string | null;
}

export interface Waypoint extends ExperienceNode {
  order: number;
  arrival_min: number;
  start_min: number;
  depart_min: number;
  wait_min: number;
  tone: Tone;
  slack_min?: number | null;
}

export interface TimelineItem {
  id: string;
  kind: "start" | "drive" | "stop" | "end" | "delay";
  start_min: number;
  end_min: number;
  title: string;
  subtitle: string;
  node_id?: string | null;
  detour_min?: number | null;
  tone: Tone;
  provenance: Provenance;
}

export interface CorridorTown { name: string; latitude: number; longitude: number; progress: number; lateral_km: number; verified: boolean }
export interface Route {
  distance_km: number;
  duration_min: number;
  polyline: [number, number][];
  via?: string | null;
  geometry_source: "serpapi_directions" | "estimated_straight" | "demo_snapshot";
  corridor: CorridorTown[];
}

export interface Robustness {
  score: number;
  label: string;
  explanation: string;
  delay_survival: number;
  buffer: number;
  fallback_cover: number;
  window_flex: number;
  min_slack_min?: number | null;
  weakest_stop_id?: string | null;
  tested: { delay_min: number; preserved: number; total: number; lost: string[]; arrive_min: number }[];
}

export interface RouteOption {
  mode: RouteMode;
  label: string;
  tagline: string;
  travel_minutes: number;
  stops: number;
  total_minutes: number;
  detour_minutes: number;
  arrive_min: number;
  robustness: number;
  stop_names: string[];
  selected: boolean;
}

export interface StaySuggestion { name: string; price_text?: string | null; rating?: number | null; link?: string | null; thumbnail?: string | null; hotel_class?: string | null }
export interface FlightOption { airline?: string | null; price_text?: string | null; duration_min?: number | null; departure?: string | null; arrival?: string | null; stops: number }
export interface Narrative { headline: string; summary: string; highlights: string[]; engine: "groq" | "rule-based" }

export interface RouteChange {
  kind: "start_time" | "mode" | "replace" | "remove" | "add" | "recovery" | "disruption";
  title: string;
  message: string;
  removed: { id: string; name: string; role?: string; reason?: string }[];
  added: { id: string; name: string; role?: string }[];
  retimed: { id: string; name: string; from: number; to: number }[];
  why?: string | null;
}

export interface PlanState {
  mode: RouteMode;
  start_min: number;
  end_by_min: number;
  delay_min: number;
  event_shift_min: number;
  excluded_ids: string[];
  forced_ids: string[];
  closed_ids: string[];
}

export interface TraceStep {
  id: string;
  phase: string;
  kind: "serpapi" | "llm" | "engine";
  label: string;
  engine?: string | null;
  query?: string | null;
  latency_ms: number;
  results?: number | null;
  cached: boolean;
  ok: boolean;
  error?: string | null;
  started_at: string;
  mode: string;
  detail?: string | null;
}

export interface JourneyRequest {
  origin: string;
  destination: string;
  date: string;
  start_time: string;
  interests: string[];
  travel_style: string;
  travel_styles: string[];
  budget?: string | null;
  end_time?: string | null;
  mode?: RouteMode | null;
  demo?: boolean | null;
  include_stay?: boolean;
}

export interface JourneyResponse {
  journey_id: string;
  version: number;
  created_at: string;
  data_mode: DataMode;
  request: JourneyRequest;
  mode: RouteMode;
  state: PlanState;
  origin: Location;
  destination: Location;
  route: Route;
  waypoints: Waypoint[];
  timeline: TimelineItem[];
  evidence: Evidence[];
  signals: CurrentSignal[];
  robustness: Robustness;
  alternatives: ExperienceNode[];
  pool: ExperienceNode[];
  route_options: RouteOption[];
  narrative: Narrative;
  sunset_min?: number | null;
  stay: StaySuggestion[];
  flights: FlightOption[];
  warnings: string[];
  change?: RouteChange | null;
  original_waypoint_ids: string[];
  trace: TraceStep[];
  total_travel_minutes: number;
  total_detour_minutes: number;
  arrive_min: number;
  direct_minutes: number;
}

export interface StageInfo { key: string; label: string; status: "pending" | "running" | "done" | "error" | "skipped"; detail?: string | null; duration_ms?: number | null }
export interface JobInfo {
  id: string;
  status: "running" | "done" | "error";
  stages: StageInfo[];
  journey_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  retriable: boolean;
  data_mode: DataMode;
}

export type Scenario = "delay" | "flight_delay" | "stop_overrun" | "stop_closed" | "event_delayed" | "skip_stop";
export interface StressRequest { journey_id: string; scenario: Scenario; minutes?: number; stop_id?: string | null }

export interface StressStop {
  stop_id: string;
  name: string;
  role: string;
  before_arrival_min: number;
  before_status: TemporalStatus;
  before_tone: Tone;
  after_arrival_min?: number | null;
  after_status?: TemporalStatus | null;
  after_tone: Tone;
  after_reason: string;
  before_slack_min?: number | null;
  after_slack_min?: number | null;
  skipped: boolean;
}

export interface RecoveryOp {
  type: "replace" | "drop";
  removed_id: string;
  removed_name: string;
  added?: ExperienceNode | null;
  reason: string;
  why: string;
  arrival_min?: number | null;
  status?: TemporalStatus | null;
  detour_min?: number | null;
  extra_travel_min?: number | null;
  score?: number | null;
}

export interface RecoveryPlan {
  ops: RecoveryOp[];
  new_sequence: string[];
  new_waypoints: Waypoint[];
  new_timeline: TimelineItem[];
  extra_travel_minutes: number;
  experiences_preserved: number;
  experiences_total: number;
  arrive_before_min: number;
  arrive_after_min: number;
  fully_recovered: boolean;
  narrative: string;
  narrative_engine: "groq" | "rule-based";
}

export interface StressResult {
  scenario: string;
  label: string;
  minutes: number;
  stop_id?: string | null;
  applicable: boolean;
  note?: string | null;
  verdict: "SURVIVED" | "BREAK_DETECTED";
  outcome: "SURVIVED" | "RECOVERED" | "PARTIALLY_RECOVERED" | "NOT_RECOVERABLE";
  headline: string;
  stops: StressStop[];
  broken: number;
  at_risk: number;
  recovery?: RecoveryPlan | null;
  robustness_before: number;
  robustness_after?: number | null;
  explanation: string;
  explanation_engine: "groq" | "rule-based";
  provenance: Provenance;
}

export interface ReplanRequest {
  journey_id: string;
  start_time?: string;
  mode?: RouteMode;
  replace_stop_id?: string;
  remove_stop_id?: string;
  add_place_id?: string;
  apply_recovery?: StressRequest;
  reset_disruptions?: boolean;
}
export interface ReplanResponse { journey: JourneyResponse; change: RouteChange }

export interface SliceNode { id: string; name: string; fit: number; status: TemporalStatus; tone: Tone; in_route: boolean; reason: string; role: string }
export interface SliceResponse { minute: number; nodes: SliceNode[]; relevant_now: string[]; unavailable_now: string[]; summary: string }
export interface SegmentDiscoverResponse { from_fraction: number; to_fraction: number; candidates: ExperienceNode[]; note?: string | null }
export interface PlaceDetail { node: ExperienceNode; journey_id?: string | null; in_route: boolean; fit_by_hour: { minute: number; fit: number; status: TemporalStatus; valid: boolean }[] }
export interface Health { status: string; serpapi_configured: boolean; groq_configured: boolean; groq_model: string; demo_available: boolean; demo_default: boolean; engines: string[] }
