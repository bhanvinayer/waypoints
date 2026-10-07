import { Link } from "react-router-dom";
import type { Robustness } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ── Ring SVG ─────────────────────────────────────────────────────── */
export function Ring({
  score,
  size = 64,
  stroke = 7,
}: {
  score: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color =
    score >= 70 ? "#168A5B" :
    score >= 40 ? "#C77A16" : "#C94A4A";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      {/* Track */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E4E2DC" strokeWidth={stroke} />
      {/* Fill */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="square"
      />
    </svg>
  );
}

/* ── RobustnessCard ───────────────────────────────────────────────── */
export function RobustnessCard({
  r,
  journeyId,
}: {
  r: Robustness;
  journeyId: string;
}) {
  const color =
    r.score >= 70 ? "text-[#168A5B]" :
    r.score >= 40 ? "text-[#C77A16]" : "text-[#C94A4A]";

  return (
    <div className="border border-[#E4E2DC] bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Ring score={r.score} size={52} stroke={5} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn("tnum text-[12px] font-bold", color)}>
              {r.score}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] font-bold mb-0.5">PLAN ROBUSTNESS</div>
          <div className={cn("text-[13px] font-bold", color)}>{r.label}</div>
          <p className="text-[11px] text-[#4B5563] font-medium mt-0.5 leading-relaxed line-clamp-2">
            {r.explanation}
          </p>
        </div>
      </div>

      {/* Delay grid */}
      {r.tested && r.tested.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-px bg-[#E4E2DC] border border-[#E4E2DC] rounded-lg overflow-hidden">
          {r.tested.map((d) => (
            <div key={d.delay_min} className="bg-[#FAFAF8] px-2 py-1.5 text-center">
              <div className="tnum text-[10px] text-[#4B5563] font-mono font-semibold">+{d.delay_min}m</div>
              <div className={cn(
                "text-[11px] font-bold mt-0.5",
                d.lost.length === 0 ? "text-[#168A5B]" : "text-[#C94A4A]"
              )}>
                {d.lost.length === 0 ? "✓" : "✕"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
