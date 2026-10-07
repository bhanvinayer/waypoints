import { AnimatePresence, motion } from "framer-motion";
import { Check, RotateCcw, Sun, X, AlertTriangle } from "lucide-react";
import type { JourneyResponse, SliceNode, SliceResponse } from "@/lib/types";
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

function StatusIcon({ status }: { status: string }) {
  const isOpen    = status === "IDEAL_WINDOW" || status === "OPEN_AT_ARRIVAL";
  const isClosing = status === "CLOSING_TOO_SOON" || status === "EVENT_CONFLICT";
  const isClosed  = status === "NOT_OPEN" || status === "WINDOW_MISSED";

  if (isOpen) return (
    <span className="status-dot ideal" />
  );
  if (isClosing) return (
    <span className="status-dot closing" />
  );
  if (isClosed) return (
    <span className="status-dot closed" />
  );
  return <span className="status-dot unknown" />;
}

function TemporalRow({ node }: { node: SliceNode }) {
  const isOpen    = node.status === "IDEAL_WINDOW" || node.status === "OPEN_AT_ARRIVAL";
  const isClosing = node.status === "CLOSING_TOO_SOON" || node.status === "EVENT_CONFLICT";
  const isClosed  = node.status === "NOT_OPEN" || node.status === "WINDOW_MISSED";

  return (
    <motion.div
      key={`${node.id}-${node.status}`}
      initial={{ opacity: 0, x: -3 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      className="flex items-center gap-2"
    >
      <StatusIcon status={node.status} />
      <span
        className={cn(
          "text-[11px] font-semibold flex-1",
          isOpen    ? "text-ok" :
          isClosing ? "text-warn" :
          isClosed  ? "text-bad line-through" : "text-graphite-200"
        )}
      >
        {node.name}
      </span>
      <span className="tnum text-[10px] text-graphite-200 shrink-0">
        {node.status === "IDEAL_WINDOW"     ? "Ideal" :
         node.status === "OPEN_AT_ARRIVAL"  ? "Open" :
         node.status === "CLOSING_TOO_SOON" ? "Closing" :
         node.status === "NOT_OPEN"         ? "Closed" :
         node.status === "WINDOW_MISSED"    ? "Missed" : ""}
      </span>
    </motion.div>
  );
}

/**
 * TemporalSlider — the signature Waypoints interaction.
 * A persistent horizontal timeline at the bottom of the map.
 * Drag to scrub through the journey day; markers update live.
 */
export function TimeSlider({ journey, value, onChange, slice, loading, className }: Props) {
  const active = value !== null;
  const v = value ?? Math.min(MAX, Math.max(MIN, journey.state.start_min));
  const pct = ((Math.min(MAX, Math.max(MIN, v)) - MIN) / (MAX - MIN)) * 100;
  const pos = (m: number) => `${((Math.min(MAX, Math.max(MIN, m)) - MIN) / (MAX - MIN)) * 100}%`;

  const inRouteNodes = slice?.nodes.filter((n) => n.in_route) ?? [];

  return (
    <div
      className={cn(
        "sys-float",
        active && "shadow-float",
        className
      )}
    >
      {/* ── Timeline body ─────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5">
            <span className="eyebrow">Timeline</span>
            {active && (
              <span className="sim-label">SCRUBBING</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Current time display */}
            <motion.div
              className={cn(
                "tnum font-mono text-[15px] font-bold leading-none px-2 py-1",
                active
                  ? "text-accent border border-accent/30 bg-[rgba(232,101,26,0.08)]"
                  : "text-graphite-600 border border-[#1E1E1E]"
              )}
              animate={{ scale: active ? 1.02 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              {fmtClock(v)}
            </motion.div>

            {/* Reset */}
            {active && (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                onClick={() => onChange(null)}
                className="grid h-7 w-7 place-items-center text-graphite-200 hover:text-white transition-colors border border-[#2A2A2A]"
                aria-label="Reset timeline"
              >
                <RotateCcw className="h-3 w-3" />
              </motion.button>
            )}
          </div>
        </div>

        {/* Waypoint markers above track */}
        <div className="relative px-[8px]">
          <div className="relative h-6 select-none mb-1">
            {journey.waypoints.map((w) => {
              const s = slice?.nodes.find((n) => n.id === w.id);
              const tone = s ? s.tone : w.tone;
              return (
                <div
                  key={w.id}
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: pos(w.arrival_min) }}
                >
                  <div
                    className={cn(
                      "thread-node transition-all duration-200",
                      active && v >= w.arrival_min
                        ? tone === "green"  ? "ok scale-110" :
                          tone === "yellow" ? "warn scale-110" :
                          tone === "red"    ? "bad scale-110" : ""
                        : "opacity-40"
                    )}
                    style={{ width: "20px", height: "20px", fontSize: "9px" }}
                  >
                    {w.order}
                  </div>
                </div>
              );
            })}

            {/* Sunset marker */}
            {journey.sunset_min != null && (
              <div
                className="absolute top-0.5 -translate-x-1/2"
                style={{ left: pos(journey.sunset_min) }}
                title={`Sunset ${fmtClock(journey.sunset_min)}`}
              >
                <Sun className="h-3.5 w-3.5 text-warn" />
              </div>
            )}
          </div>

          {/* Range input — the temporal scrubber */}
          <input
            type="range"
            className="wp-range"
            min={MIN}
            max={MAX}
            step={5}
            value={v}
            style={{ ["--p" as string]: `${pct}%` }}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="Journey timeline"
            aria-valuetext={fmtClock(v)}
          />

          {/* Tick labels */}
          <div className="relative -mt-0.5 h-4 select-none">
            {TICKS.map((h) => (
              <span
                key={h}
                className="tnum absolute -translate-x-1/2 text-[9px] font-medium text-graphite-300"
                style={{ left: pos(h * 60) }}
              >
                {h === 12 ? "12" : h > 12 ? `${h - 12}` : `${h}`}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Temporal states panel ────────────────────────────── */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-[#1E1E1E]"
          >
            <div className={cn("px-4 py-2.5 transition-opacity", loading && "opacity-40")}>
              <div className="eyebrow mb-2">
                AT {fmtClock(v)}
              </div>
              {inRouteNodes.length > 0 ? (
                <div className="space-y-1.5">
                  <AnimatePresence mode="popLayout">
                    {inRouteNodes.slice(0, 6).map((n) => (
                      <TemporalRow key={n.id} node={n} />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <p className="text-[11px] text-graphite-200">
                  {slice?.summary ?? "Checking windows…"}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
