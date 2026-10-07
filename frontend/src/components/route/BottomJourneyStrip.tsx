import { cn } from "@/lib/utils";

interface Props {
  eta: string;
  distanceKm: number;
  stops: number;
  detourMin: number;
  robustness: { label: string; score: number };
  onWhatIf: () => void;
  onStressTest: () => void;
}

export function BottomJourneyStrip({ eta, distanceKm, stops, detourMin, robustness, onWhatIf, onStressTest }: Props) {
  const robColor = robustness.score >= 70 ? "text-[#168A5B]" : robustness.score >= 40 ? "text-[#C77A16]" : "text-[#C94A4A]";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-[#F8F7F3]/95 border-t border-[#E4E2DC] backdrop-blur-md shadow-[0_-2px_10px_rgba(20,25,35,0.04)]">
      <div className="mx-auto max-w-[1600px] flex items-center gap-0 px-4 h-11">
        {/* Stats */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="eyebrow text-[10px] text-[#667085] font-bold">ETA</span>
            <span className="tnum text-[12.5px] font-bold text-[#151A23]">{eta}</span>
          </div>
          <div className="h-3 w-px bg-[#E4E2DC]" />
          <div className="flex items-center gap-1.5">
            <span className="tnum text-[11px] font-semibold text-[#2D3440]">{distanceKm} km</span>
          </div>
          <div className="h-3 w-px bg-[#E4E2DC]" />
          <div className="flex items-center gap-1.5">
            <span className="tnum text-[11px] font-semibold text-[#2D3440]">{stops} stops</span>
          </div>
          <div className="h-3 w-px bg-[#E4E2DC] hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="tnum text-[11px] font-semibold text-[#2D3440]">+{detourMin}m detour</span>
          </div>
          <div className="h-3 w-px bg-[#E4E2DC] hidden md:block" />
          <div className="hidden md:flex items-center gap-1.5">
            <span className="eyebrow text-[10px] text-[#667085] font-bold">Robust</span>
            <span className={cn("tnum text-[11px] font-bold", robColor)}>{robustness.score}%</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onWhatIf}
            className="px-3 h-7.5 text-[10px] font-bold uppercase tracking-wider text-[#151A23] bg-white border border-[#E4E2DC] hover:border-[#F45B22] hover:text-[#F45B22] rounded-[6px] transition-colors cursor-pointer"
          >
            WHAT IF?
          </button>
          <button
            onClick={onStressTest}
            className="px-3.5 h-7.5 text-[10px] font-bold uppercase tracking-wider text-white bg-[#F45B22] hover:bg-[#D94A18] rounded-[6px] transition-colors cursor-pointer shadow-sm"
          >
            STRESS TEST
          </button>
        </div>
      </div>
    </div>
  );
}
