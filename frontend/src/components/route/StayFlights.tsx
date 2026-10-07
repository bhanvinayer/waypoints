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
    <div className="border border-[#2A2A2A] bg-[#F8F7F3] text-[#172033]">

      {/* Header */}
      <div className="eyebrow px-3 py-2 border-b border-[#2A2A2A] text-[#53627A]">
        STAY + FLIGHTS · {destination.toUpperCase()}
      </div>

      {/* Accommodation */}
      {stay && (
        <div className="px-3 py-2.5 border-b border-[#2A2A2A]">

          <div className="eyebrow mb-1.5 text-[#53627A]">
            ACCOMMODATION
          </div>

          {/* Hotel name */}
          <div className="text-[12px] font-bold text-[#172033]">
            {stay.name}
          </div>

          {stay.price_text && (
            <div className="tnum text-[11px] text-[#53627A] mt-0.5">
              {stay.price_text} / night
            </div>
          )}

          {stay.link && (
            <a
              href={stay.link}
              target="_blank"
              rel="noreferrer"
              className="mt-1 text-[10.5px] font-medium text-[#E85D3F] hover:underline block"
            >
              View hotel →
            </a>
          )}

        </div>
      )}

      {/* Flights */}
      {flights && flights.length > 0 && (
        <div className="px-3 py-2.5">

          <div className="eyebrow mb-1.5 text-[#53627A]">
            FLIGHTS
          </div>

          <div className="space-y-2">

            {flights.slice(0, 2).map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2"
              >

                <div className="min-w-0">

                  {/* Airline name */}
                  <div className="text-[11.5px] font-semibold text-[#172033]">
                    {f.airline}
                  </div>

                  {/* Flight timing */}
                  <div className="tnum text-[10px] text-[#667085]">
                    {f.departure} → {f.arrival}
                  </div>

                </div>

                {/* Price */}
                <div className="text-right shrink-0">
                  <div className="tnum text-[12px] font-bold text-[#172033]">
                    {f.price_text}
                  </div>
                </div>

              </div>
            ))}

          </div>
        </div>
      )}

    </div>
  );
}

