import type { StaySuggestion, FlightOption } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  stay?: StaySuggestion | null;
  flights?: FlightOption[] | null;
  destination: string;
}

export function StayFlights({ stay, flights, destination }: Props) {
  if (!stay && (!flights || flights.length === 0)) return null;

  return (
    <div className="border border-[#2A2A2A]">
      <div className="eyebrow px-3 py-2 border-b border-[#1E1E1E]">STAY + FLIGHTS · {destination.toUpperCase()}</div>

      {stay && (
        <div className="px-3 py-2.5 border-b border-[#1E1E1E]">
          <div className="eyebrow mb-1.5">ACCOMMODATION</div>
          <div className="text-[12px] font-bold text-white">{stay.name}</div>
          {stay.price_text && (
            <div className="tnum text-[11px] text-graphite-200 mt-0.5">
              {stay.price_text} / night
            </div>
          )}
          {stay.link && (
            <a href={stay.link} target="_blank" rel="noreferrer" className="mt-1 text-[10.5px] text-accent hover:underline block">
              View hotel →
            </a>
          )}
        </div>
      )}

      {flights && flights.length > 0 && (
        <div className="px-3 py-2.5">
          <div className="eyebrow mb-1.5">FLIGHTS</div>
          <div className="space-y-2">
            {flights.slice(0, 2).map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11.5px] font-semibold text-white">{f.airline}</div>
                  <div className="tnum text-[10px] text-graphite-300">{f.departure} → {f.arrival}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="tnum text-[12px] font-bold text-white">{f.price_text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
