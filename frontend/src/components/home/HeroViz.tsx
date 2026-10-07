import { useEffect, useMemo, useState } from "react";
import { fmtClock } from "@/lib/time";
import { cn } from "@/lib/utils";

// Illustrative journey thread — Delhi → Jaipur corridor
// 5 stops with different temporal windows
const STOPS = [
  { name: "Delhi", order: 0, t: 480,  open: [0, 9999] as [number, number],    kind: "origin" },
  { name: "Chandni Chowk", order: 1, t: 570,  open: [540, 840] as [number, number],   kind: "stop" },
  { name: "Neemrana Fort", order: 2, t: 720,  open: [600, 1050] as [number, number],  kind: "stop" },
  { name: "Highway Dhaba", order: 3, t: 810,  open: [660, 960] as [number, number],   kind: "stop" },
  { name: "Jaipur", order: 4, t: 1200, open: [0, 9999] as [number, number],    kind: "dest" },
];

const START = 360;   // 6 AM
const END   = 1380;  // 11 PM

/** Minimal static map of Delhi–Jaipur corridor */
function CorridorMap({ currentTime }: { currentTime: number }) {
  const stops = STOPS;

  return (
    <div className="relative w-full h-full bg-[#0B0B0B] overflow-hidden">
      {/* SVG route layer */}
      <svg
        viewBox="0 0 400 220"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background grid — subtle infrastructure feel */}
        <line x1="0" y1="55" x2="400" y2="55" stroke="#111" strokeWidth="0.5" />
        <line x1="0" y1="110" x2="400" y2="110" stroke="#111" strokeWidth="0.5" />
        <line x1="0" y1="165" x2="400" y2="165" stroke="#111" strokeWidth="0.5" />
        <line x1="100" y1="0" x2="100" y2="220" stroke="#111" strokeWidth="0.5" />
        <line x1="200" y1="0" x2="200" y2="220" stroke="#111" strokeWidth="0.5" />
        <line x1="300" y1="0" x2="300" y2="220" stroke="#111" strokeWidth="0.5" />

        {/* Route path */}
        <path
          d="M 30,110 C 60,100 80,80 110,90 S 160,120 200,110 S 260,80 290,90 S 340,110 370,120"
          fill="none"
          stroke="#1A1A1A"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M 30,110 C 60,100 80,80 110,90 S 160,120 200,110 S 260,80 290,90 S 340,110 370,120"
          fill="none"
          stroke="#2A2A2A"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Stop nodes */}
        {[
          { x: 30, y: 110, order: 0, name: "Delhi",    t: 480 },
          { x: 110, y: 90, order: 1, name: "Chandni",  t: 570 },
          { x: 200, y: 110, order: 2, name: "Neemrana", t: 720 },
          { x: 290, y: 90, order: 3, name: "Dhaba",    t: 810 },
          { x: 370, y: 120, order: 4, name: "Jaipur",   t: 1200 },
        ].map((stop) => {
          const stopDef = STOPS.find((s) => s.order === stop.order)!;
          const isActive = currentTime >= stop.t && currentTime <= stop.t + 120;
          const isPast = currentTime > stop.t + 120;
          const isOpen = currentTime >= stopDef.open[0] && currentTime <= stopDef.open[1];
          const isOriginDest = stop.order === 0 || stop.order === 4;

          return (
            <g key={stop.order}>
              {/* Connection from route to label */}
              {stop.order === 1 && (
                <line x1={stop.x} y1={stop.y} x2={stop.x} y2={stop.y - 24} stroke="#1E1E1E" strokeWidth="1" />
              )}
              {stop.order === 3 && (
                <line x1={stop.x} y1={stop.y} x2={stop.x} y2={stop.y - 24} stroke="#1E1E1E" strokeWidth="1" />
              )}

              {/* Node circle */}
              <circle
                cx={stop.x}
                cy={stop.y}
                r={isOriginDest ? 5 : 8}
                fill={
                  isActive      ? "#E8651A" :
                  isPast        ? (isOpen ? "#1A3325" : "#2D1515") :
                  isOriginDest  ? "#FFFFFF" : "#111111"
                }
                stroke={
                  isActive ? "#E8651A" :
                  isOpen ? "#22C55E" : "#2A2A2A"
                }
                strokeWidth="1.5"
              />

              {/* Order number */}
              {!isOriginDest && (
                <text
                  x={stop.x}
                  y={stop.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isActive ? "#FFFFFF" : isOpen ? "#22C55E" : "#383838"}
                  fontSize="8"
                  fontWeight="700"
                  fontFamily="Inter, monospace"
                >
                  {stop.order}
                </text>
              )}

              {/* Name label */}
              <text
                x={stop.x}
                y={stop.order % 2 === 0 ? stop.y + 18 : stop.y - 16}
                textAnchor="middle"
                fill={isActive ? "#E8651A" : "#505050"}
                fontSize="7"
                fontWeight="600"
                fontFamily="Inter, sans-serif"
                letterSpacing="0.06em"
                style={{ textTransform: "uppercase" }}
              >
                {stop.name.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Time indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span className="tnum font-mono text-[13px] font-bold text-white bg-[rgba(0,0,0,0.7)] px-2.5 py-1 border border-[#1E1E1E]">
          {fmtClock(currentTime)}
        </span>
      </div>

      {/* Open count */}
      <div className="absolute bottom-3 left-3">
        {(() => {
          const openCount = STOPS.filter(
            s => s.kind === "stop" && currentTime >= s.open[0] && currentTime <= s.open[1]
          ).length;
          return (
            <span className="text-[10px] font-bold text-graphite-200 bg-[rgba(0,0,0,0.6)] px-2 py-1 border border-[#1E1E1E]">
              {openCount}/{STOPS.filter(s => s.kind === "stop").length} OPEN
            </span>
          );
        })()}
      </div>
    </div>
  );
}

/**
 * HeroViz — static demo of temporal map visualization.
 * Replaces old sky-gradient animation with navigation-system aesthetic.
 * Auto-advances through the journey day.
 */
export function HeroViz() {
  const [t, setT] = useState(720); // start at noon
  const [dragging, setDragging] = useState(false);

  // Auto-advance
  useEffect(() => {
    if (dragging) return;
    const id = setInterval(() => {
      setT((prev) => {
        const next = prev + 10;
        return next > END ? START : next;
      });
    }, 180);
    return () => clearInterval(id);
  }, [dragging]);

  return (
    <div className="sys-panel overflow-hidden select-none">
      {/* Map canvas */}
      <div className="h-40 relative">
        <CorridorMap currentTime={t} />
      </div>

      {/* Timeline scrubber */}
      <div className="border-t border-[#1E1E1E] px-3 py-2.5">
        <div className="flex items-center gap-3">
          <span className="eyebrow shrink-0">PREVIEW</span>
          <input
            type="range"
            className="wp-range flex-1"
            min={START}
            max={END}
            step={10}
            value={t}
            style={{ ["--p" as string]: `${((t - START) / (END - START)) * 100}%` }}
            onChange={(e) => setT(Number(e.target.value))}
            onMouseDown={() => setDragging(true)}
            onMouseUp={() => setDragging(false)}
            onTouchStart={() => setDragging(true)}
            onTouchEnd={() => setDragging(false)}
            aria-label="Preview time of day"
          />
        </div>
        <p className="mt-1 text-[9.5px] text-graphite-300">
          Drag to preview how stop availability changes · <span className="text-graphite-200">illustrative</span>
        </p>
      </div>
    </div>
  );
}
