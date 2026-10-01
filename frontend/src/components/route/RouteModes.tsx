import { Binoculars, Camera, Check, Gauge, Loader2, Sparkles, Utensils } from "lucide-react";
import type { RouteMode, RouteOption } from "@/lib/types";
import { fmtClock, fmtDuration } from "@/lib/time";
import { cn } from "@/lib/utils";

const ICON: Record<RouteMode, typeof Gauge> = { fastest: Gauge, experience: Sparkles, food_trail: Utensils, scenic: Camera, discovery: Binoculars };

export function ModeTabs({ options, onSelect, pending }: { options: RouteOption[]; onSelect: (m: RouteMode) => void; pending?: RouteMode | null }) {
  return (
    <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Route style">
      {options.map((o) => {
        const Icon = ICON[o.mode];
        return (
          <button
            key={o.mode}
            role="tab"
            aria-selected={o.selected}
            onClick={() => !o.selected && onSelect(o.mode)}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-bold transition active:scale-95", o.selected ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-600 hover:border-ink-300")}
          >
            {pending === o.mode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function RouteComparison({ options, onSelect, pending }: { options: RouteOption[]; onSelect: (m: RouteMode) => void; pending?: RouteMode | null }) {
  return (
    <div className="space-y-2.5">
      {options.map((o) => {
        const Icon = ICON[o.mode];
        return (
          <button
            key={o.mode}
            onClick={() => !o.selected && onSelect(o.mode)}
            className={cn("w-full rounded-2xl border bg-white p-3.5 text-left transition hover:shadow-card", o.selected ? "border-accent ring-2 ring-accent/20" : "border-line")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={cn("grid h-9 w-9 place-items-center rounded-xl", o.selected ? "bg-accent text-white" : "bg-sand-200 text-ink-600")}>
                  {pending === o.mode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                </span>
                <div>
                  <div className="font-display text-[15px] font-bold leading-tight">{o.label} {o.selected && <Check className="ml-0.5 inline h-4 w-4 text-accent" />}</div>
                  <div className="text-[12px] text-ink-500">{o.tagline}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="eyebrow !text-[10px]">Robustness</div>
                <div className="tnum font-display text-lg font-extrabold leading-none">{o.robustness}%</div>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                ["Travel", fmtDuration(o.travel_minutes)],
                ["Stops", String(o.stops)],
                ["Detour", `+${o.detour_minutes}m`],
                ["Arrive", fmtClock(o.arrive_min, { short: true })],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-sand-100 py-1.5">
                  <dt className="eyebrow !text-[9.5px]">{k}</dt>
                  <dd className="tnum text-[13px] font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            {o.stop_names.length > 0 && <p className="mt-2 truncate text-[11.5px] text-ink-500">{o.stop_names.join(" → ")}</p>}
          </button>
        );
      })}
      <p className="text-[11.5px] text-ink-500">Five objective functions over the same Temporal Experience Graph. Never one "best" route — you choose.</p>
    </div>
  );
}
