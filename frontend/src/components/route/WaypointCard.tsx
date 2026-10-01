import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, Check, ChevronDown, Clock, Fuel, Loader2, Replace, ShieldAlert, Star, TriangleAlert, X, FileSearch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlaceArt } from "@/components/ui/place-art";
import { ProvenanceChip, StatusChip } from "@/components/ui/chips";
import type { ExperienceNode, Waypoint } from "@/lib/types";
import { fmtClock, fmtDuration } from "@/lib/time";
import { cn, pct, roleLabel } from "@/lib/utils";

export function FitBar({ value, tone = "ok", className }: { value: number; tone?: "ok" | "warn" | "bad"; className?: string }) {
  const color = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-bad";
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-sand-200", className)} role="presentation">
      <motion.div className={cn("h-full rounded-full", color)} initial={{ width: 0 }} animate={{ width: `${Math.round(value * 100)}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
    </div>
  );
}

const SCORE_ROWS: [keyof ExperienceNode["scores"], string, string][] = [
  ["preference_fit", "Preference fit", "25%"],
  ["temporal_fit", "Temporal fit", "20%"],
  ["route_fit", "Route fit", "20%"],
  ["quality", "Experience quality", "15%"],
  ["evidence", "Evidence reliability", "10%"],
  ["current_relevance", "Current relevance", "10%"],
];

export function ScoreBars({ node }: { node: ExperienceNode }) {
  return (
    <div className="space-y-2">
      {SCORE_ROWS.map(([k, label, w]) => {
        const v = node.scores[k] as number;
        return (
          <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-semibold text-ink-600">{label} <span className="font-medium text-ink-300">· weight {w}</span></span>
            </div>
            <span className="tnum text-[12px] font-bold">{pct(v)}</span>
            <FitBar value={v} tone={v >= 0.7 ? "ok" : v >= 0.45 ? "warn" : "bad"} className="col-span-2 h-1.5" />
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t border-line pt-2 text-[12px]">
        <span className="font-semibold text-ink-600">Waypoint score for <i>this</i> journey</span>
        <span className="tnum font-display text-lg font-extrabold">{Math.round(node.scores.total)}<span className="text-xs font-semibold text-ink-400">/100</span></span>
      </div>
    </div>
  );
}

export function WhyList({ node }: { node: ExperienceNode }) {
  return (
    <ul className="space-y-1.5">
      {node.reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
          {r.status === "pass" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" strokeWidth={3} /> : r.status === "warn" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-bad" strokeWidth={3} />}
          <span className="flex-1 text-ink-700">{r.text}</span>
          <ProvenanceChip provenance={r.provenance} compact className="mt-0.5 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon?: typeof Clock; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-sand-100 px-3 py-2">
      <div className="eyebrow !text-[10px] flex items-center gap-1">{Icon && <Icon className="h-3 w-3" />}{label}</div>
      <div className="tnum mt-0.5 text-[15px] font-bold leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-ink-500">{sub}</div>}
    </div>
  );
}

interface Props {
  node: Waypoint | ExperienceNode;
  index?: number;
  selected?: boolean;
  onSelect?: () => void;
  onEvidence: () => void;
  onReplace?: () => void;
  onAdd?: () => void;
  replacing?: boolean;
  adding?: boolean;
  nameOf?: (id: string) => string | undefined;
  compact?: boolean;
  journeyId?: string;
}

export function WaypointCard({ journeyId, node, index, selected, onSelect, onEvidence, onReplace, onAdd, replacing, adding, nameOf, compact }: Props) {
  const wp = "order" in node ? (node as Waypoint) : null;
  const [open, setOpen] = useState(false);
  const t = node.temporal;
  const fit = t?.score ?? 0;
  const tone = wp?.tone ?? (t ? (!t.valid ? "red" : t.score >= 0.7 ? "green" : "yellow") : "gray");
  const arrival = wp?.arrival_min ?? t?.arrival_min;
  const start = wp?.start_min ?? t?.start_min;
  const depart = wp?.depart_min ?? t?.depart_min;
  const fbNames = (node.fallback_options ?? []).map((id) => nameOf?.(id)).filter(Boolean) as string[];
  const cats = Array.from(new Set([roleLabel(node.role), ...node.category])).slice(0, 3);

  return (
    <motion.article
      layout
      id={`card-${node.id}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ delay: (index ?? 0) * 0.04, type: "spring", stiffness: 260, damping: 28 }}
      onClick={onSelect}
      className={cn("card cursor-pointer overflow-hidden transition-shadow", selected && "ring-2 ring-accent ring-offset-2 ring-offset-sand")}
    >
      <div className={cn("relative", compact ? "h-20" : "h-28 sm:h-32")}>
        {node.thumbnail ? <img src={node.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" /> : <PlaceArt role={node.role} seed={node.id} name={node.name} />}
        <div className="absolute inset-0 bg-gradient-to-t from-night/45 to-transparent" />
        {wp && (
          <div className={cn("absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full border-[3px] border-white font-display text-sm font-extrabold text-white shadow-lg", wp.tone === "green" ? "bg-ok" : wp.tone === "yellow" ? "bg-warn" : "bg-bad")}>
            {String(wp.order).padStart(2, "0")}
          </div>
        )}
        <div className="absolute right-3 top-3 flex gap-1.5">
          {node.hidden_gem && <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-accent-600">Hidden gem</span>}
          {node.kind === "event" && <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">Live event</span>}
        </div>
        {t && <div className="absolute bottom-2.5 left-3"><StatusChip status={t.status} tone={tone} className="bg-white/95" /></div>}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap gap-1.5">
              {cats.map((c) => <span key={c} className="text-[10.5px] font-bold uppercase tracking-wider text-ink-500 after:ml-1.5 after:content-['·'] last:after:content-['']">{c}</span>)}
            </div>
            <h3 className="font-display text-xl font-bold leading-tight">{node.name}</h3>
          </div>
          {node.rating != null && (
            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-sand-100 px-2 py-1 text-sm font-bold">
              <Star className="h-3.5 w-3.5 fill-warn text-warn" /> {node.rating.toFixed(1)}
            </div>
          )}
        </div>

        {arrival != null && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Arrive" value={fmtClock(arrival)} sub={t && t.wait_min > 0 ? `wait ${t.wait_min} min` : undefined} />
            <Stat label="Leave" value={fmtClock(depart)} sub={`${fmtDuration(node.estimated_visit_minutes)} visit`} />
            <Stat icon={Fuel} label="Detour" value={`+${Math.round(node.route_detour_minutes)} min`} sub={node.route_detour_km ? `+${node.route_detour_km.toFixed(0)} km · ₹${Math.round(node.detour_cost_inr)}` : "on route"} />
            <Stat label="Travel here" value={fmtDuration(node.travel_from_previous_minutes)} sub={node.travel_source === "observed" ? "from Google Directions" : "estimated"} />
          </div>
        )}

        <div className="mt-3.5">
          <div className="mb-1 flex items-center justify-between text-[12px]">
            <span className="font-bold text-ink-600">Temporal fit</span>
            <span className="tnum font-extrabold">{pct(fit)}</span>
          </div>
          <FitBar value={fit} tone={tone === "green" ? "ok" : tone === "yellow" ? "warn" : "bad"} />
        </div>

        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-700">
          <span className="font-bold text-ink">Why: </span>
          {node.one_liner ? `${node.one_liner}. ` : ""}
          {t?.reason}
        </p>

        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={onEvidence}><FileSearch className="h-3.5 w-3.5" /> View evidence</Button>
          {onReplace && (
            <Button size="sm" variant="outline" onClick={onReplace} disabled={replacing || node.fallback_options.length === 0} title={node.fallback_options.length ? "Swap for a validated alternative" : "No validated alternative at this point"}>
              {replacing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Replace className="h-3.5 w-3.5" />} Replace
            </Button>
          )}
          {onAdd && (
            <Button size="sm" variant="accent" onClick={onAdd} disabled={adding || !(t?.valid ?? true)}>
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add to route
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            Why this stop? <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="mt-4 space-y-5 border-t border-line pt-4">
                <div>
                  <div className="eyebrow mb-2">Why it made your route</div>
                  <WhyList node={node} />
                </div>
                <div>
                  <div className="eyebrow mb-2">Waypoint score breakdown</div>
                  <ScoreBars node={node} />
                </div>
                {node.failure_risks.length > 0 && (
                  <div>
                    <div className="eyebrow mb-2">What could go wrong</div>
                    <ul className="space-y-1.5">
                      {node.failure_risks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-ink-700"><ShieldAlert className={cn("mt-0.5 h-4 w-4 shrink-0", r.severity === "high" ? "text-bad" : r.severity === "medium" ? "text-warn" : "text-ink-400")} />{r.label}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {node.reviews.length > 0 && (
                  <div>
                    <div className="eyebrow mb-2">What reviewers say <ProvenanceChip provenance="observed" compact /></div>
                    <div className="flex flex-wrap gap-1.5">
                      {node.reviews.map((r) => (
                        <span key={r.theme} title={r.snippet} className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-semibold", r.sentiment === "positive" ? "bg-ok-50 text-ok" : r.sentiment === "negative" ? "bg-bad-50 text-bad" : "bg-sand-200 text-ink-600")}>{r.theme}</span>
                      ))}
                    </div>
                  </div>
                )}
                {fbNames.length > 0 && (
                  <div>
                    <div className="eyebrow mb-2">Validated fallbacks <ProvenanceChip provenance="inferred" compact /></div>
                    <p className="text-[13px] text-ink-700">{fbNames.join(" · ")}</p>
                  </div>
                )}
                <Button asChild size="sm" variant="ghost" className="-ml-2"><Link to={`/place/${node.id}${journeyId ? `?journey=${journeyId}` : ""}`}>Full experience page <ArrowUpRight className="h-3.5 w-3.5" /></Link></Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}
