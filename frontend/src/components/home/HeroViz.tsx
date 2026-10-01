import { useEffect, useMemo, useState } from "react";
import { fmtClock } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Pin { name: string; kind: string; open: [number, number]; x: number; y: number; emoji: string }

// Illustrative only (clearly labelled): five experiences with different opening windows along one route.
const PINS: Pin[] = [
  { name: "Heritage fort", kind: "9 AM – 5:30 PM", open: [540, 1050], x: 14, y: 60, emoji: "🏰" },
  { name: "Street-food stall", kind: "6 AM – 11 AM", open: [360, 660], x: 33, y: 28, emoji: "🥟" },
  { name: "Highway thali", kind: "12 – 3 PM", open: [720, 900], x: 52, y: 66, emoji: "🍛" },
  { name: "Sunset viewpoint", kind: "5 – 6:15 PM", open: [1020, 1095], x: 72, y: 30, emoji: "🌇" },
  { name: "Live folk music", kind: "7:30 – 9:30 PM", open: [1170, 1290], x: 88, y: 62, emoji: "🎶" },
];
const START = 360;
const END = 1380;

export function HeroViz() {
  const [t, setT] = useState(11 * 60);
  const reduce = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setT((v) => (v + 6 > END ? START : v + 6)), 70);
    return () => clearInterval(id);
  }, [reduce]);

  const pct = ((t - START) / (END - START)) * 100;
  const openCount = PINS.filter((p) => t >= p.open[0] && t <= p.open[1]).length;

  return (
    <div className="card relative overflow-hidden bg-night p-4 text-white md:p-6" aria-label="Illustration: the same route at different times of day">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow !text-white/50">The Temporal Experience Graph</div>
          <div className="font-display text-lg font-bold md:text-xl">The same route is a different place at {fmtClock(t, { short: true })}</div>
        </div>
        <div className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold tnum">{openCount} / {PINS.length} fit</div>
      </div>

      <div className="relative h-[190px] md:h-[230px]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d="M2 70 C 12 70, 10 50, 20 46 S 30 30, 40 44 S 50 76, 60 58 S 70 30, 80 38 S 92 66, 98 40" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          <path d="M2 70 C 12 70, 10 50, 20 46 S 30 30, 40 44 S 50 76, 60 58 S 70 30, 80 38 S 92 66, 98 40" fill="none" stroke="#E8501C" strokeWidth="2" strokeDasharray="1 7" vectorEffect="non-scaling-stroke" strokeLinecap="round" className="wp-route-flow" />
        </svg>
        {PINS.map((p) => {
          const open = t >= p.open[0] && t <= p.open[1];
          return (
            <div key={p.name} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <div className={cn("mx-auto grid h-11 w-11 place-items-center rounded-full border-2 text-xl transition-all duration-500", open ? "scale-110 border-ok bg-ok/25 shadow-[0_0_0_6px_rgba(30,158,106,.18)]" : "scale-90 border-white/15 bg-white/5 opacity-40 grayscale")}>
                {p.emoji}
              </div>
              <div className={cn("mt-1.5 hidden whitespace-nowrap text-[10px] font-semibold leading-tight transition-opacity duration-500 sm:block", open ? "opacity-100" : "opacity-40")}>
                {p.name}
                <div className="font-medium text-white/50">{p.kind}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative mt-2">
        <div className="h-1.5 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-accent transition-[width] duration-100" style={{ width: `${pct}%` }} />
        </div>
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pct}%` }}>
          <div className="h-4 w-4 rounded-full border-[3px] border-white bg-accent shadow-glow" />
        </div>
        <div className="mt-3 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-white/40">
          {["6 AM", "10 AM", "2 PM", "6 PM", "10 PM"].map((l) => <span key={l}>{l}</span>)}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-white/45">Illustrative example — in the app every window comes from Google Maps hours and events for your actual date.</p>
    </div>
  );
}
