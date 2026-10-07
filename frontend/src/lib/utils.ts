import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Role, TemporalStatus, Tone } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ROLE_LABEL: Record<string, string> = {
  meal:      "Meal",
  snack:     "Snack & Café",
  heritage:  "Heritage",
  museum:    "Museum",
  viewpoint: "Viewpoint",
  nature:    "Nature",
  market:    "Market",
  event:     "Event",
  nightlife: "Nightlife",
  religious: "Spiritual",
  activity:  "Activity",
  other:     "Stop",
};

export const STATUS_LABEL: Record<TemporalStatus, string> = {
  IDEAL_WINDOW:     "Ideal",
  OPEN_AT_ARRIVAL:  "Open",
  CLOSING_TOO_SOON: "Closing",
  NOT_OPEN:         "Closed",
  EVENT_CONFLICT:   "Conflict",
  WINDOW_MISSED:    "Missed",
  UNKNOWN_HOURS:    "Unknown hours",
};

export const TONE_STYLE: Record<Tone, { dot: string; text: string; bg: string; border: string; label: string }> = {
  green:  { dot: "bg-ok",     text: "text-ok",      bg: "bg-ok/10",   border: "border-ok/30",    label: "Strong fit"  },
  yellow: { dot: "bg-warn",   text: "text-warn",    bg: "bg-warn/10", border: "border-warn/30",  label: "Conditional" },
  red:    { dot: "bg-bad",    text: "text-bad",     bg: "bg-bad/10",  border: "border-bad/30",   label: "Doesn't fit" },
  gray:   { dot: "bg-graphite-400", text: "text-graphite-200", bg: "bg-[#111111]", border: "border-[#2A2A2A]", label: "Alternative" },
};

export const ENGINE_LABEL: Record<string, string> = {
  google_maps:            "Google Maps",
  google_maps_reviews:    "Maps Reviews",
  google_maps_directions: "Maps Directions",
  google:                 "Google Search",
  google_news:            "Google News",
  google_events:          "Google Events",
  google_flights:         "Google Flights",
  google_hotels:          "Google Hotels",
  waypoints_engine:       "WAYPOINTS Engine",
};

export function engineLabel(engine?: string | null): string {
  if (!engine) return "";
  if (engine.startsWith("groq:")) return `Groq · ${engine.slice(5)}`;
  return ENGINE_LABEL[engine] ?? engine;
}

export function roleLabel(role: Role | string): string {
  return ROLE_LABEL[role] ?? role;
}

export function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export function plural(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

/** Format milliseconds as human-readable latency */
export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

/** CSS color class based on latency */
export function latencyColor(ms: number): string {
  if (ms < 200) return "text-ok";
  if (ms < 500) return "text-warn";
  return "text-bad";
}
