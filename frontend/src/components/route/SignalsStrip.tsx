import type { CurrentSignal } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  signals: CurrentSignal[];
  onOpen?: (s: CurrentSignal) => void;
}

export function SignalsStrip({ signals, onOpen }: Props) {
  if (!signals || signals.length === 0) return null;

  return (
    <div className="border border-[#E4E2DC] bg-white rounded-xl overflow-hidden shadow-sm">
      <div className="eyebrow px-4 py-3 border-b border-[#E4E2DC] text-[10px] tracking-[0.14em] text-[#667085] font-bold">
        LIVE SIGNALS
      </div>
      <div className="divide-y divide-[#E4E2DC]">
        {signals.slice(0, 4).map((s, i) => (
          <button
            key={i}
            onClick={() => onOpen?.(s)}
            className="w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-[#FAFAF8] transition-colors cursor-pointer"
          >
            <span className={cn(
              "status-dot shrink-0 mt-1.5",
              s.severity === "warn"  ? "closed" :
              s.severity === "watch" ? "closing" : "open"
            )} />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-bold text-[#151A23] truncate">{s.title}</div>
              <div className="text-[11px] text-[#4B5563] font-medium mt-0.5 leading-snug line-clamp-1">{s.detail}</div>
            </div>
            <span className="text-[9.5px] text-[#667085] shrink-0 uppercase tracking-wider font-bold">{s.kind}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
