import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Role, TemporalStatus, Tone } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ROLE_LABEL: Record<string, string> = {
  meal: "Meal", snack: "Snack & café", heritage: "Heritage", museum: "Museum", viewpoint: "Viewpoint", nature: "Nature",
  market: "Market", event: "Live event", nightlife: "Nightlife", religious: "Spiritual", activity: "Activity", other: "Stop",
};

export const STATUS_LABEL: Record<TemporalStatus, string> = {
  IDEAL_WINDOW: "Ideal window",
  OPEN_AT_ARRIVAL: "Open at arrival",
  CLOSING_TOO_SOON: "Closing too soon",
  NOT_OPEN: "Not open",
  EVENT_CONFLICT: "Event conflict",
  WINDOW_MISSED: "Window missed",
  UNKNOWN_HOURS: "Hours unverified",
};

export const TONE_STYLE: Record<Tone, { dot: string; text: string; bg: string; border: string; label: string }> = {
  green: { dot: "bg-ok", text: "text-ok", bg: "bg-ok-50", border: "border-ok-100", label: "Strong fit" },
  yellow: { dot: "bg-warn", text: "text-[#9a6c00]", bg: "bg-warn-50", border: "border-warn-100", label: "Conditional" },
  red: { dot: "bg-bad", text: "text-bad", bg: "bg-bad-50", border: "border-bad-100", label: "Doesn't fit" },
  gray: { dot: "bg-ink-400", text: "text-ink-500", bg: "bg-sand-100", border: "border-line", label: "Alternative" },
};

export const ENGINE_LABEL: Record<string, string> = {
  google_maps: "Google Maps",
  google_maps_reviews: "Google Maps Reviews",
  google_maps_directions: "Google Maps Directions",
  google: "Google Search",
  google_news: "Google News",
  google_events: "Google Events",
  google_flights: "Google Flights",
  google_hotels: "Google Hotels",
  waypoints_engine: "WAYPOINTS engine",
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
