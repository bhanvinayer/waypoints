import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { RouteMode, RouteOption } from "@/lib/types";
import { fmtDuration } from "@/lib/time";
import { cn } from "@/lib/utils";

const MODE_LABELS: Record<RouteMode, string> = {
  fastest:    "Fastest",
  scenic:     "Scenic",
  experience: "Experience",
  food_trail: "Food Trail",
  discovery:  "Discovery",
};

interface ModeTabsProps {
  options: RouteOption[];
  onSelect: (mode: RouteMode) => void;
  pending?: RouteMode | null;
}

/**
 * ModeTabs — compact route objective switching.
 * Monochrome by default. Orange for active.
 */
export function ModeTabs({ options, onSelect, pending }: ModeTabsProps) {
  const active = options.find((o) => o.selected);

  return (
    <div className="flex border-b border-[#E4E2DC] bg-white">
      {options.map((opt) => {
        const isActive = opt.selected;
        const isPending = pending === opt.mode;
        return (
          <button
            key={opt.mode}
            onClick={() => onSelect(opt.mode)}
            disabled={!!pending}
            className={cn(
              "flex-1 flex flex-col items-center py-2.5 px-1 text-center transition-all cursor-pointer",
              "border-b-2 -mb-px text-[10px] font-bold uppercase tracking-wider",
              isActive
                ? "border-[#F45B22] text-[#F45B22]"
                : "border-transparent text-[#667085] hover:text-[#151A23] hover:border-[#E4E2DC]",
              "disabled:opacity-60"
            )}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mb-0.5" />
            ) : (
              <>
                <span className="tnum text-[12px] font-bold mb-0.5 leading-none">
                  {fmtDuration(opt.total_minutes).replace("h", "h ").replace("m", "m")}
                </span>
                <span>{MODE_LABELS[opt.mode] ?? opt.mode}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * RouteComparison — technical comparison of route modes.
 */
export function RouteComparison({
  options,
  onSelect,
  pending,
}: {
  options: RouteOption[];
  onSelect: (mode: RouteMode) => void;
  pending?: RouteMode | null;
}) {
  return (
    <div className="border border-[#E4E2DC] bg-white rounded-xl overflow-hidden shadow-sm">
      <div className="eyebrow px-4 py-3 border-b border-[#E4E2DC] text-[10px] tracking-[0.14em] text-[#667085] font-bold">
        5 OBJECTIVES · SAME GRAPH
      </div>
      <div className="divide-y divide-[#E4E2DC]">
        {options.map((opt) => {
          const isActive = opt.selected;
          const isPending = pending === opt.mode;
          return (
            <button
              key={opt.mode}
              onClick={() => onSelect(opt.mode)}
              disabled={!!pending}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer",
                isActive ? "bg-[#FFF4EF]" : "hover:bg-[#FAFAF8]",
                "disabled:opacity-60"
              )}
            >
              {/* Active indicator */}
              <div
                className={cn(
                  "w-1 h-6 shrink-0 rounded-full transition-colors",
                  isActive ? "bg-[#F45B22]" : "bg-[#E4E2DC]"
                )}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn(
                    "text-[12px] font-bold",
                    isActive ? "text-[#151A23]" : "text-[#2D3440]"
                  )}>
                    {MODE_LABELS[opt.mode]}
                  </span>
                  <span className="tnum text-[11px] font-semibold text-[#4B5563] shrink-0">
                    {fmtDuration(opt.total_minutes)}
                  </span>
                </div>
                <div className="tnum text-[10px] text-[#667085] font-medium mt-0.5">
                  {opt.stops} stops · {opt.travel_minutes} min drive
                </div>
              </div>

              {isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F45B22] shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
