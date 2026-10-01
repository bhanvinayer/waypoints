import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, FileSearch, MapPin, Star } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TopBar } from "@/components/layout/TopBar";
import { PlaceArt } from "@/components/ui/place-art";
import { ProvenanceChip, StatusChip } from "@/components/ui/chips";
import { Button } from "@/components/ui/button";
import { EvidenceSheet } from "@/components/route/EvidenceSheet";
import { ScoreBars, WhyList } from "@/components/route/WaypointCard";
import { api, ApiError } from "@/lib/api";
import { fmtClock, fmtDuration } from "@/lib/time";
import { roleLabel } from "@/lib/utils";
import NotFound from "./NotFound";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function PlacePage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const journey = params.get("journey") ?? undefined;
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["place", id, journey], queryFn: () => api.place(id, journey) });
  const ev = useQuery({ queryKey: ["place-ev", id, journey], queryFn: () => api.placeEvidence(id, journey), enabled: open });
  const jq = useQuery({ queryKey: ["journey", q.data?.journey_id], queryFn: () => api.journey(q.data!.journey_id!), enabled: !!q.data?.journey_id });

  if (q.isLoading) return <div className="min-h-dvh"><TopBar /><div className="mx-auto max-w-3xl space-y-4 p-4"><div className="skeleton h-52" /><div className="skeleton h-40" /></div></div>;
  if (q.isError || !q.data) return <NotFound message={(q.error as ApiError | null)?.message ?? "Place not found"} />;

  const { node: n, fit_by_hour: curve, in_route } = q.data;
  const jid = q.data.journey_id ?? undefined;
  const t = n.temporal;
  const tone = t ? (!t.valid ? "red" : t.score >= 0.7 ? "green" : "yellow") : "gray";
  const chart = curve.map((c) => ({ ...c, label: fmtClock(c.minute, { short: true }) }));
  const arrival = t?.arrival_min;
  const sunset = jq.data?.sunset_min;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-dvh">
      <TopBar mode={jq.data?.data_mode} journeyId={jid} />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-5 md:pt-8">
        <Link to={jid ? `/route/${jid}` : "/"} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-accent"><ArrowLeft className="h-4 w-4" /> Back to route</Link>
        <div className="card overflow-hidden">
          <div className="relative h-48 md:h-60">
            {n.thumbnail ? <img src={n.thumbnail} alt="" className="h-full w-full object-cover" /> : <PlaceArt role={n.role} seed={n.id} name={n.name} />}
            <div className="absolute inset-0 bg-gradient-to-t from-night/60 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5 text-white">
              <div className="mb-1 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wider">
                <span>{roleLabel(n.role)}</span>{n.category.slice(0, 2).map((c) => <span key={c} className="opacity-70">· {c}</span>)}
              </div>
              <h1 className="font-display text-3xl font-extrabold leading-tight md:text-4xl">{n.name}</h1>
            </div>
          </div>
          <div className="space-y-6 p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-3">
              {n.rating != null && <span className="flex items-center gap-1 rounded-lg bg-sand-100 px-2.5 py-1 text-sm font-bold"><Star className="h-4 w-4 fill-warn text-warn" />{n.rating.toFixed(1)}<span className="font-medium text-ink-500">({n.review_count?.toLocaleString() ?? "—"})</span></span>}
              {t && <StatusChip status={t.status} tone={tone as any} />}
              <span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-600">{in_route ? "On your route" : "Not on your route"}</span>
              <span className="text-xs font-semibold text-ink-500">{fmtDuration(n.estimated_visit_minutes)} visit <ProvenanceChip provenance={n.visit_minutes_source} compact /></span>
            </div>
            {n.address && <p className="flex items-start gap-2 text-sm text-ink-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{n.address}</p>}
            {n.description && <p className="text-[15px] leading-relaxed text-ink-700">{n.description}</p>}

            <section>
              <h2 className="font-display text-xl font-bold">Experience window</h2>
              <p className="mb-2 text-[13px] text-ink-500">How well this place works if you arrive at each time of day on your journey date. <ProvenanceChip provenance="inferred" compact /></p>
              <div className="h-44" role="img" aria-label="Temporal fit by arrival time">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 6, right: 4, left: -26, bottom: 0 }} barCategoryGap={2}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#5B6F69" }} tickLine={false} axisLine={false} interval={3} />
                    <YAxis tick={{ fontSize: 10, fill: "#5B6F69" }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                    <Tooltip cursor={{ fill: "rgba(16,33,29,.05)" }} formatter={(v: any) => [`${v}% fit`, "Arrive then"]} labelFormatter={(l) => `Arrive ${l}`} contentStyle={{ borderRadius: 12, border: "1px solid #E7E0D3", fontSize: 12 }} />
                    <Bar dataKey="fit" radius={[4, 4, 0, 0]}>{chart.map((c, i) => <Cell key={i} fill={!c.valid ? "#E7E0D3" : c.fit >= 70 ? "#1E9E6A" : "#D99A00"} />)}</Bar>
                    {arrival != null && <ReferenceLine x={fmtClock(Math.round(arrival / 30) * 30, { short: true })} stroke="#E8501C" strokeWidth={2} label={{ value: "you", fill: "#E8501C", fontSize: 11, position: "top" }} />}
                    {sunset != null && <ReferenceLine x={fmtClock(Math.round(sunset / 30) * 30, { short: true })} stroke="#D99A00" strokeDasharray="4 3" label={{ value: "sunset", fill: "#9a6c00", fontSize: 10, position: "top" }} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {t && <p className="mt-2 rounded-xl bg-sand-100 p-3 text-[13px] text-ink-700"><b>On your journey: </b>{t.reason}</p>}
            </section>

            <section><h2 className="mb-2 font-display text-xl font-bold">Why this stop?</h2><WhyList node={n} /></section>
            <section><h2 className="mb-3 font-display text-xl font-bold">Waypoint score for this journey</h2><ScoreBars node={n} /></section>

            {Object.keys(n.hours_text).length > 0 && (
              <section>
                <h2 className="mb-2 font-display text-xl font-bold">Opening hours <ProvenanceChip provenance="observed" compact /></h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[13.5px]">
                  {DAYS.filter((d) => n.hours_text[d]).map((d) => (<div key={d} className="contents"><dt className="font-semibold capitalize text-ink-600">{d}</dt><dd className="tnum">{n.hours_text[d]}</dd></div>))}
                </dl>
              </section>
            )}

            {n.reviews.length > 0 && (
              <section>
                <h2 className="mb-2 font-display text-xl font-bold">What reviewers say <ProvenanceChip provenance="observed" compact /></h2>
                <ul className="space-y-2">{n.reviews.map((r) => <li key={r.theme} className="rounded-xl bg-sand-100 p-3 text-[13.5px]"><b className="text-ink">{r.theme}</b><p className="mt-0.5 text-ink-600">“{r.snippet}”</p></li>)}</ul>
              </section>
            )}

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="outline" onClick={() => setOpen(true)}><FileSearch className="h-4 w-4" /> View evidence</Button>
              {n.link && <Button asChild variant="ghost"><a href={n.link} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" /> Website</a></Button>}
            </div>
          </div>
        </div>
      </main>
      <EvidenceSheet target={open ? { title: n.name, eyebrow: "Evidence", items: ev.data ?? n.evidence, reasons: n.reasons } : null} onClose={() => setOpen(false)} />
    </motion.div>
  );
}
