import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, FileSearch, MapPin, Star } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TopBar } from "@/components/layout/TopBar";
import { ProvenanceChip, StatusChip } from "@/components/ui/chips";
import { Button } from "@/components/ui/button";
import { EvidenceSheet } from "@/components/route/EvidenceSheet";
import { ScoreBars, WhyList } from "@/components/route/WaypointCard";
import { api, ApiError } from "@/lib/api";
import { fmtClock, fmtDuration } from "@/lib/time";
import { cn, roleLabel } from "@/lib/utils";
import NotFound from "./NotFound";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function PlacePage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const journey = params.get("journey") ?? undefined;
  const [open, setOpen] = useState(false);

  const q  = useQuery({ queryKey: ["place", id, journey], queryFn: () => api.place(id, journey) });
  const ev = useQuery({ queryKey: ["place-ev", id, journey], queryFn: () => api.placeEvidence(id, journey), enabled: open });
  const jq = useQuery({
    queryKey: ["journey", q.data?.journey_id],
    queryFn: () => api.journey(q.data!.journey_id!),
    enabled: !!q.data?.journey_id,
  });

  if (q.isLoading) return (
    <div className="min-h-dvh bg-canvas">
      <TopBar />
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        {[52, 40, 64].map((h, i) => <div key={i} className="skeleton" style={{ height: `${h * 4}px` }} />)}
      </div>
    </div>
  );

  if (q.isError || !q.data)
    return <NotFound message={(q.error as ApiError | null)?.message ?? "Place not found"} />;

  const { node: n, fit_by_hour: curve, in_route } = q.data;
  const jid     = q.data.journey_id ?? undefined;
  const t       = n.temporal;
  const tone    = t ? (!t.valid ? "red" : t.score >= 0.7 ? "green" : "yellow") : "gray";
  const chart   = curve.map((c) => ({ ...c, label: fmtClock(c.minute, { short: true }) }));
  const arrival = t?.arrival_min;
  const sunset  = jq.data?.sunset_min;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-dvh bg-canvas">
      <TopBar mode={jq.data?.data_mode} journeyId={jid} />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-5">
        {/* Back */}
        <Link
          to={jid ? `/route/${jid}` : "/"}
          className="mb-5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-graphite-200 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to route
        </Link>

        {/* Place header */}
        <div className="border border-[#2A2A2A] mb-4">
          {/* Name block */}
          <div className="px-4 py-4 border-b border-[#1E1E1E]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-graphite-300 mb-1">
              {[roleLabel(n.role), ...n.category.slice(0, 2)].join(" · ")}
            </div>
            <h1 className="font-display text-[28px] font-extrabold leading-tight text-white md:text-[34px]">
              {n.name}
            </h1>

            {/* Info row */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {n.rating != null && (
                <span className="flex items-center gap-1.5 text-[12px]">
                  <Star className="h-3.5 w-3.5 fill-warn text-warn" />
                  <span className="font-bold text-white">{n.rating.toFixed(1)}</span>
                  {n.review_count && <span className="text-graphite-200">({n.review_count.toLocaleString()})</span>}
                </span>
              )}
              {t && <StatusChip status={t.status} tone={tone as any} />}
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border",
                in_route
                  ? "border-accent/30 text-accent bg-[rgba(232,101,26,0.08)]"
                  : "border-[#2A2A2A] text-graphite-300"
              )}>
                {in_route ? "On your route" : "Not on route"}
              </span>
              <span className="ml-auto tnum text-[11px] text-graphite-300">
                {fmtDuration(n.estimated_visit_minutes)} visit{" "}
                <ProvenanceChip provenance={n.visit_minutes_source} compact />
              </span>
            </div>
          </div>

          {/* Journey timing */}
          {t && (
            <div className="grid grid-cols-3 divide-x divide-[#1E1E1E]">
              {[
                { label: "ARRIVE",  value: fmtClock(t.arrival_min) },
                { label: "DEPART",  value: fmtClock(t.depart_min) },
                { label: "DETOUR",  value: `+${Math.round(n.route_detour_minutes)}m` },
              ].map((s) => (
                <div key={s.label} className="px-4 py-3 text-center">
                  <div className="eyebrow mb-1">{s.label}</div>
                  <div className="tnum text-[16px] font-bold text-white">{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        {n.description && (
          <p className="mb-4 text-[13.5px] leading-relaxed text-graphite-100">{n.description}</p>
        )}

        {n.address && (
          <p className="mb-4 flex items-start gap-2 text-[12px] text-graphite-300">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {n.address}
          </p>
        )}

        {/* Score section */}
        <div className="border border-[#2A2A2A] mb-4">
          <div className="eyebrow px-4 py-3 border-b border-[#1E1E1E]">SCORE BREAKDOWN</div>
          <div className="px-4 py-4">
            <ScoreBars node={n} />
          </div>
        </div>

        {/* Why */}
        <div className="border border-[#2A2A2A] mb-4">
          <div className="eyebrow px-4 py-3 border-b border-[#1E1E1E]">ROUTE VALIDATION</div>
          <div className="px-4 py-4">
            <WhyList node={n} />
          </div>
        </div>

        {/* Temporal fit chart */}
        <div className="border border-[#2A2A2A] mb-4">
          <div className="px-4 py-3 border-b border-[#1E1E1E]">
            <div className="font-display text-[15px] font-bold text-white">Experience window</div>
            <p className="mt-0.5 text-[11px] text-graphite-300">
              Temporal fit by arrival time on your journey date.{" "}
              <ProvenanceChip provenance="inferred" compact />
            </p>
          </div>
          <div className="px-4 py-4">
            <div className="h-44" role="img" aria-label="Temporal fit chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 6, right: 4, left: -26, bottom: 0 }} barCategoryGap={2}>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#505050" }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={{ fontSize: 9, fill: "#505050" }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    formatter={(v: any) => [`${v}% fit`, "Arrive then"]}
                    labelFormatter={(l) => `Arrive ${l}`}
                    contentStyle={{ background: "#111111", border: "1px solid #2A2A2A", borderRadius: 0, fontSize: 11, color: "#F5F5F2" }}
                  />
                  <Bar dataKey="fit" radius={[2, 2, 0, 0]}>
                    {chart.map((c, i) => (
                      <Cell key={i} fill={!c.valid ? "#1A1A1A" : c.fit >= 70 ? "#22C55E" : c.fit >= 40 ? "#EAB308" : "#EF4444"} />
                    ))}
                  </Bar>
                  {arrival != null && (
                    <ReferenceLine x={fmtClock(Math.round(arrival / 30) * 30, { short: true })} stroke="#E8651A" strokeWidth={2}
                      label={{ value: "you", fill: "#E8651A", fontSize: 10, position: "top" }} />
                  )}
                  {sunset != null && (
                    <ReferenceLine x={fmtClock(Math.round(sunset / 30) * 30, { short: true })} stroke="#EAB308" strokeDasharray="4 3"
                      label={{ value: "sunset", fill: "#EAB308", fontSize: 9, position: "top" }} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {t && (
              <p className="mt-3 border border-accent/20 bg-[rgba(232,101,26,0.06)] px-3 py-2 text-[12px] text-graphite-100">
                <b className="text-white">On your journey: </b>{t.reason}
              </p>
            )}
          </div>
        </div>

        {/* Opening hours */}
        {Object.keys(n.hours_text).length > 0 && (
          <div className="border border-[#2A2A2A] mb-4">
            <div className="eyebrow px-4 py-3 border-b border-[#1E1E1E] flex items-center gap-2">
              OPENING HOURS <ProvenanceChip provenance="observed" compact />
            </div>
            <div className="px-4 py-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[12px]">
                {DAYS.filter((d) => n.hours_text[d]).map((d) => (
                  <div key={d} className="contents">
                    <dt className="font-semibold capitalize text-graphite-200">{d}</dt>
                    <dd className="tnum text-graphite-100">{n.hours_text[d]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        {/* Reviews */}
        {n.reviews.length > 0 && (
          <div className="border border-[#2A2A2A] mb-4">
            <div className="eyebrow px-4 py-3 border-b border-[#1E1E1E] flex items-center gap-2">
              VISITOR REVIEWS <ProvenanceChip provenance="observed" compact />
            </div>
            <div className="divide-y divide-[#1A1A1A]">
              {n.reviews.map((r) => (
                <div key={r.theme} className="px-4 py-3">
                  <div className="text-[12px] font-bold text-white">{r.theme}</div>
                  <p className="mt-0.5 text-[11.5px] text-graphite-200">"{r.snippet}"</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpen(true)}>
            <FileSearch className="h-3.5 w-3.5" /> View evidence
          </Button>
          {n.link && (
            <Button asChild variant="ghost">
              <a href={n.link} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Website
              </a>
            </Button>
          )}
        </div>
      </main>

      <EvidenceSheet
        target={open ? { title: n.name, eyebrow: "Evidence", items: ev.data ?? n.evidence, reasons: n.reasons } : null}
        onClose={() => setOpen(false)}
      />
    </motion.div>
  );
}
