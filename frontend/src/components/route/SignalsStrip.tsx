import { CalendarDays, Newspaper, Sunset, TriangleAlert } from "lucide-react";
import type { CurrentSignal } from "@/lib/types";
import { fmtClock } from "@/lib/time";
import { cn } from "@/lib/utils";

export function SignalsStrip({ signals, onOpen }: { signals: CurrentSignal[]; onOpen: (s: CurrentSignal) => void }) {
  if (!signals.length) return null;
  return (
    <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {signals.map((s) => {
        const Icon = s.kind === "sunset" ? Sunset : s.kind === "event" ? CalendarDays : s.kind === "closure" ? TriangleAlert : Newspaper;
        const sev = s.severity === "warn" ? "border-bad-100 bg-bad-50 text-bad" : s.severity === "watch" ? "border-warn-100 bg-warn-50 text-[#8a6100]" : "border-line bg-white text-ink-600";
        return (
          <button key={s.id} onClick={() => onOpen(s)} className={cn("flex max-w-[260px] shrink-0 items-start gap-2 rounded-xl border px-3 py-2 text-left transition hover:shadow-card active:scale-[0.98]", sev)}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-bold leading-tight">{s.title}</span>
              <span className="block truncate text-[11px] opacity-70">
                {s.kind === "event" && s.start_min != null ? `${fmtClock(s.start_min)}–${fmtClock(s.end_min)} · ` : ""}
                {s.publisher ?? (s.provenance === "inferred" ? "computed" : "Google Events")}
                {s.date ? ` · ${s.date}` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
