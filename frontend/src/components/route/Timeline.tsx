import { Car, Flag, Hourglass, MapPin } from "lucide-react";
import type { TimelineItem } from "@/lib/types";
import { fmtClock } from "@/lib/time";
import { cn } from "@/lib/utils";

export function Timeline({ items, selectedId, onSelect, order }: { items: TimelineItem[]; selectedId: string | null; onSelect: (id: string) => void; order: Record<string, number> }) {
  return (
    <ol className="relative">
      <div aria-hidden className="absolute bottom-3 left-[19px] top-3 w-px bg-line" />
      {items.map((it) => {
        const isStop = it.kind === "stop";
        const sel = isStop && it.node_id === selectedId;
        const Icon = it.kind === "start" ? MapPin : it.kind === "end" ? Flag : it.kind === "delay" ? Hourglass : Car;
        return (
          <li key={it.id} className="relative pl-12">
            <div className="absolute left-0 top-0 grid h-10 w-10 place-items-center">
              {isStop ? (
                <span className={cn("grid h-8 w-8 place-items-center rounded-full border-[3px] border-sand font-display text-[13px] font-extrabold text-white shadow", it.tone === "green" ? "bg-ok" : it.tone === "yellow" ? "bg-warn" : "bg-bad", sel && "ring-4 ring-accent/30")}>
                  {order[it.node_id ?? ""] ?? ""}
                </span>
              ) : (
                <span className={cn("grid h-6 w-6 place-items-center rounded-full border-2 bg-sand", it.kind === "delay" ? "border-warn text-warn" : it.kind === "drive" ? "border-line text-ink-400" : "border-ink text-ink")}>
                  <Icon className="h-3 w-3" />
                </span>
              )}
            </div>
            {isStop ? (
              <button
                onClick={() => it.node_id && onSelect(it.node_id)}
                className={cn("mb-1.5 flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white", sel && "bg-white shadow-card")}
              >
                <div className="min-w-0">
                  <div className="truncate font-display text-[15px] font-bold leading-tight">{it.title}</div>
                  <div className="truncate text-[12px] text-ink-500">{it.subtitle}</div>
                </div>
                <div className="tnum shrink-0 text-right text-[12px] font-semibold text-ink-600">
                  <div className="text-[13px] font-bold text-ink">{fmtClock(it.start_min)}</div>
                  <div className="text-ink-400">→ {fmtClock(it.end_min)}</div>
                </div>
              </button>
            ) : (
              <div className="mb-1 flex min-h-8 items-center justify-between gap-3 px-3 py-1 text-[12px]">
                <div className="min-w-0 truncate">
                  <span className={cn("font-semibold", it.kind === "drive" ? "text-ink-400" : "text-ink-700")}>{it.title}</span>
                  {it.subtitle && <span className="text-ink-400"> · {it.subtitle}</span>}
                </div>
                <span className="tnum shrink-0 font-semibold text-ink-500">{fmtClock(it.start_min)}</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
