import { BedDouble, ExternalLink, Plane, Star } from "lucide-react";
import type { FlightOption, StaySuggestion } from "@/lib/types";
import { fmtDuration } from "@/lib/time";

export function StayFlights({ stay, flights, destination }: { stay: StaySuggestion[]; flights: FlightOption[]; destination: string }) {
  if (!stay.length && !flights.length) return null;
  return (
    <div className="space-y-3">
      {flights.length > 0 && (
        <div className="rounded-2xl border border-line bg-white p-3.5">
          <div className="mb-2 flex items-center gap-2"><Plane className="h-4 w-4 text-accent" /><span className="eyebrow">Or fly instead · Google Flights</span></div>
          {flights.map((f, i) => (
            <div key={i} className="flex items-center justify-between border-t border-line py-2 first:border-t-0 text-[13px]">
              <span className="font-semibold">{f.airline ?? "Flight"}{f.stops ? ` · ${f.stops} stop` : " · non-stop"}</span>
              <span className="tnum text-ink-600">{fmtDuration(f.duration_min)} · <b className="text-ink">{f.price_text ?? "—"}</b></span>
            </div>
          ))}
        </div>
      )}
      {stay.length > 0 && (
        <div className="rounded-2xl border border-line bg-white p-3.5">
          <div className="mb-2 flex items-center gap-2"><BedDouble className="h-4 w-4 text-accent" /><span className="eyebrow">Where to end the night in {destination} · Google Hotels</span></div>
          {stay.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0 text-[13px]">
              <div className="min-w-0">
                <div className="truncate font-semibold">{s.name}</div>
                <div className="text-[11.5px] text-ink-500">{s.hotel_class}</div>
              </div>
              <div className="shrink-0 text-right">
                {s.rating != null && <div className="flex items-center justify-end gap-1 text-[12px] font-bold"><Star className="h-3 w-3 fill-warn text-warn" />{s.rating.toFixed(1)}</div>}
                <div className="tnum text-[12.5px] font-bold">{s.price_text ?? "—"}<span className="font-medium text-ink-400">/night</span></div>
              </div>
              {s.link && <a href={s.link} target="_blank" rel="noreferrer noopener" aria-label={`Open ${s.name}`} className="text-ink-300 hover:text-accent"><ExternalLink className="h-4 w-4" /></a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
