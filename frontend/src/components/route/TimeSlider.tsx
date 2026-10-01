import { RotateCcw, Sun } from "lucide-react";
import type { JourneyResponse, SliceResponse } from "@/lib/types";
import { fmtClock } from "@/lib/time";
import { cn } from "@/lib/utils";

const MIN = 6 * 60;
const MAX = 23 * 60;
const TICKS = [6, 8, 10, 12, 14, 16, 18, 20, 22];

interface Props {
  journey: JourneyResponse;
  value: number | null;
  onChange: (m: number | null) => void;
  slice?: SliceResponse;
  loading?: boolean;
  className?: string;
}

export function TimeSlider({ journey, value, onChange, slice, loading, className }: Props) {
  const active = value !== null;
  const v = value ?? Math.min(MAX, Math.max(MIN, journey.state.start_min));
  const pos = (m: number) => `${((Math.min(MAX, Math.max(MIN, m)) - MIN) / (MAX - MIN)) * 100}%`;
  const pct = ((v - MIN) / (MAX - MIN)) * 100;

  return (
    <div className={cn("rounded-2xl border border-line bg-white/95 p-3.5 shadow-float backdrop-blur md:p-4", className)}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">Time slider</div>
          <div className="truncate text-[13px] font-medium text-ink-500">
            {active ? "Arrive at any time — watch the city change" : "Drag to see how the same route changes through the day"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className={cn("tnum rounded-xl px-3 py-1.5 font-display text-lg font-extrabold leading-none transition-colors", active ? "bg-accent text-white" : "bg-sand-200 text-ink-500")}>
            {fmtClock(v)}
          </div>
          {active && (
            <button onClick={() => onChange(null)} className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-ink-500 transition hover:text-accent" aria-label="Back to journey view" title="Back to journey view">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-3 px-[13px]">
        {/* markers for the planned arrivals and sunset */}
        <div className="pointer-events-none relative h-6">
          {journey.waypoints.map((w) => (
            <div key={w.id} className="absolute top-0 -translate-x-1/2" style={{ left: pos(w.arrival_min) }}>
              <div className={cn("grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold text-white shadow", w.tone === "green" ? "bg-ok" : w.tone === "yellow" ? "bg-warn" : "bg-bad")}>{w.order}</div>
            </div>
          ))}
          {journey.sunset_min != null && (
            <div className="absolute top-0 -translate-x-1/2 text-warn" style={{ left: pos(journey.sunset_min) }} title={`Sunset ${fmtClock(journey.sunset_min)}`}>
              <Sun className="h-5 w-5" />
            </div>
          )}
        </div>
        <input
          type="range"
          className="wp-range"
          min={MIN}
          max={MAX}
          step={15}
          value={v}
          style={{ ["--p" as any]: `${pct}%` }}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Arrival time of day"
          aria-valuetext={fmtClock(v)}
        />
        <div className="relative -mt-0.5 h-4">
          {TICKS.map((h) => (
            <span key={h} className="tnum absolute -translate-x-1/2 text-[10px] font-semibold text-ink-400" style={{ left: pos(h * 60) }}>
              {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
            </span>
          ))}
        </div>
      </div>

      {active && (
        <div className={cn("mt-3 border-t border-line pt-2.5 text-[12.5px] transition-opacity", loading && "opacity-50")}>
          <p className="font-medium text-ink-600">{slice?.summary ?? "Checking every experience at this time…"}</p>
          {slice && slice.relevant_now.length > 0 && (
            <div className="mt-2 hidden flex-wrap gap-1.5 md:flex">
              {slice.relevant_now.slice(0, 5).map((n) => <span key={n} className="rounded-full bg-ok-50 px-2 py-0.5 text-[11px] font-semibold text-ok">{n}</span>)}
            </div>
          )}
          {slice && slice.unavailable_now.length > 0 && (
            <p className="mt-1.5 text-[12px] font-semibold text-bad">✕ Wouldn't work then: {slice.unavailable_now.slice(0, 3).join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
