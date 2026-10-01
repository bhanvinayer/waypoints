import { motion } from "framer-motion";
import { Info } from "lucide-react";
import type { Robustness } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Ring({ score, size = 76, stroke = 8, className }: { score: number; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "#1E9E6A" : score >= 60 ? "#D99A00" : "#D3402F";
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ECE5D8" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={{ duration: 0.9, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="tnum font-display text-xl font-extrabold leading-none">{score}<span className="text-[11px] font-bold text-ink-400">%</span></span>
      </div>
    </div>
  );
}

export function RobustnessCard({ r }: { r: Robustness }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-line bg-white p-4">
      <Ring score={r.score} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="eyebrow">Plan robustness</span>
          <span title="Computed from time buffers, opening windows, event windows, travel times and fallback availability by re-running the route under delays. It is not a probability that your trip will succeed." className="cursor-help text-ink-300"><Info className="h-3.5 w-3.5" /></span>
        </div>
        <div className="font-display text-lg font-bold leading-tight">{r.label}</div>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-600">{r.explanation}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.tested.map((t) => (
            <span key={t.delay_min} className={cn("tnum rounded-full px-2 py-0.5 text-[10.5px] font-bold", t.preserved === t.total ? "bg-ok-50 text-ok" : "bg-bad-50 text-bad")} title={t.lost.length ? `Loses: ${t.lost.join(", ")}` : "Everything still fits"}>
              +{t.delay_min}m · {t.preserved}/{t.total}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
