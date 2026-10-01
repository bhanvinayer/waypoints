import { Brain, Calculator, ExternalLink, FlaskConical, MapPin, Newspaper, Search, CalendarDays, Star, Route as RouteIcon, Plane, Hotel } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { ProvenanceChip } from "@/components/ui/chips";
import type { Evidence, Provenance, Reason } from "@/lib/types";
import { timeAgo } from "@/lib/time";
import { cn, engineLabel } from "@/lib/utils";

const KIND_ICON: Record<Evidence["kind"], typeof MapPin> = {
  maps: MapPin, reviews: Star, search: Search, news: Newspaper, event: CalendarDays, directions: RouteIcon, computed: Calculator, hotel: Hotel, flight: Plane,
};
const KIND_TITLE: Record<Evidence["kind"], string> = {
  maps: "Google Maps", reviews: "Google Maps reviews", search: "Google Search", news: "Google News", event: "Google Events",
  directions: "Google Maps Directions", computed: "Computed by WAYPOINTS", hotel: "Google Hotels", flight: "Google Flights",
};

export interface EvidenceTarget {
  title: string;
  eyebrow?: string;
  items: Evidence[];
  reasons?: Reason[];
}

function Item({ e }: { e: Evidence }) {
  const Icon = KIND_ICON[e.kind];
  return (
    <li className="rounded-2xl border border-line bg-white p-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sand-200 text-ink-600"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-500">{KIND_TITLE[e.kind]}</span>
            <ProvenanceChip provenance={e.provenance} />
          </div>
          <p className="mt-1 font-semibold leading-snug text-ink">{e.title}</p>
          {e.detail && <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{e.detail}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-500">
            <span className="font-semibold">{engineLabel(e.source)}</span>
            {e.publisher && <span>{e.publisher}</span>}
            {e.date && <span>{e.date}</span>}
            {e.mode === "live" && e.retrieved_at ? <span className="text-ok">● checked {timeAgo(e.retrieved_at)}</span> : e.mode === "demo" ? <span className="text-[#8a6100]">demo snapshot</span> : null}
            {e.url && (
              <a href={e.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                Source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

const PROV_ORDER: Provenance[] = ["observed", "inferred", "simulated", "user"];

export function EvidenceSheet({ target, onClose }: { target: EvidenceTarget | null; onClose: () => void }) {
  const items = target?.items ?? [];
  const groups = PROV_ORDER.map((p) => ({ p, list: items.filter((i) => i.provenance === p) })).filter((g) => g.list.length);
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()} eyebrow={target?.eyebrow ?? "Evidence"} title={target?.title ?? ""} description="Why are you saying this? Every claim, with where it came from.">
      {target && (
        <div className="space-y-6 pb-6">
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-xl bg-ok-50 p-2 font-semibold text-ok"><b className="block text-lg">{items.filter((i) => i.provenance === "observed").length}</b>observed</div>
            <div className="rounded-xl bg-sand-200 p-2 font-semibold text-ink-600"><b className="block text-lg">{(target.reasons?.filter((r) => r.provenance === "inferred").length ?? 0) + items.filter((i) => i.provenance === "inferred").length}</b>inferred</div>
            <div className="rounded-xl bg-accent-50 p-2 font-semibold text-accent-600"><b className="block text-lg">{items.filter((i) => i.provenance === "simulated").length}</b>simulated</div>
          </div>
          {groups.map(({ p, list }) => (
            <section key={p}>
              <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-bold">
                {p === "observed" ? "Observed through SerpApi" : p === "inferred" ? "Inferred by WAYPOINTS" : p === "simulated" ? "Simulated" : "You told us"}
              </h3>
              <ul className="space-y-2.5">{list.map((e) => <Item key={e.id} e={e} />)}</ul>
            </section>
          ))}
          {target.reasons && target.reasons.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-bold"><Brain className="h-4 w-4" /> How the temporal engine reasoned</h3>
              <ul className="space-y-2">
                {target.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl bg-white p-3 text-[13px] text-ink-700">
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", r.status === "pass" ? "bg-ok" : r.status === "warn" ? "bg-warn" : "bg-bad")} />
                    <span className="flex-1">{r.text}</span>
                    <ProvenanceChip provenance={r.provenance} compact />
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex items-start gap-2 text-[12px] text-ink-500"><FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" /> The language model never supplies facts: it only reasons over the observed evidence above.</p>
            </section>
          )}
          {items.length === 0 && !target.reasons?.length && <p className="text-sm text-ink-500">No evidence records were attached to this item.</p>}
        </div>
      )}
    </Sheet>
  );
}
