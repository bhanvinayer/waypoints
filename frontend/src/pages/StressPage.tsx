import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Ban, CalendarClock, Check,
  FastForward, Hourglass, Loader2, RotateCcw,
  Shield, ShieldAlert, SkipForward, Timer,
  TriangleAlert, Wrench, X, Zap,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { ProvenanceChip } from "@/components/ui/chips";
import { Ring } from "@/components/route/RobustnessRing";
import { api, ApiError } from "@/lib/api";
import type { Scenario, StressResult, StressStop, Tone, Waypoint } from "@/lib/types";
import { fmtClock, fmtDuration, timeAgo } from "@/lib/time";
import { cn, STATUS_LABEL } from "@/lib/utils";
import NotFound from "./NotFound";

interface ScenarioDef {
  key: string; scenario: Scenario; minutes: number;
  label: string; icon: typeof Timer; needsStop?: boolean; hint: string; demo?: boolean;
}

const SCENARIOS: ScenarioDef[] = [
  { key: "d30",    scenario: "delay",         minutes: 30, label: "+30 min delay",       icon: Timer,        hint: "Traffic, late start"  },
  { key: "d45",    scenario: "delay",         minutes: 45, label: "+45 min delay",       icon: Hourglass,    hint: "The demo scenario", demo: true },
  { key: "d60",    scenario: "delay",         minutes: 60, label: "+60 min delay",       icon: FastForward,  hint: "A really bad day"     },
  { key: "closed", scenario: "stop_closed",   minutes: 0,  label: "Stop closes",         icon: Ban,          hint: "Venue shut",    needsStop: true },
  { key: "event",  scenario: "event_delayed", minutes: 30, label: "Event delayed +30m",  icon: CalendarClock,hint: "Event pushed"         },
  { key: "skip",   scenario: "skip_stop",     minutes: 0,  label: "Skip a stop",         icon: SkipForward,  hint: "Change of plans", needsStop: true },
  { key: "overrun",scenario: "stop_overrun",  minutes: 30, label: "Stop overruns +30m",  icon: Zap,          hint: "Lost track of time", needsStop: true },
];

const toneBg = (t: Tone) =>
  t === "green"  ? "border-ok/40 bg-[rgba(34,197,94,0.08)] text-ok" :
  t === "yellow" ? "border-warn/40 bg-[rgba(234,179,8,0.08)] text-warn" :
  t === "red"    ? "border-bad/40 bg-[rgba(239,68,68,0.08)] text-bad" : "border-[#2A2A2A] text-graphite-200";

function StopRow({ s, side }: { s: StressStop; side: "before" | "after" }) {
  const tone    = side === "before" ? s.before_tone    : s.after_tone;
  const arrival = side === "before" ? s.before_arrival_min : s.after_arrival_min;
  const status  = side === "before" ? s.before_status  : s.after_status;
  return (
    <li className="flex items-start gap-3 py-2 border-b border-[#1A1A1A] last:border-0">
      <div className={cn("h-6 w-6 grid place-items-center border shrink-0 mt-0.5 text-[10px] font-bold", toneBg(tone))}>
        {tone === "green" ? <Check className="h-3 w-3" strokeWidth={3} /> :
         tone === "yellow" ? <TriangleAlert className="h-3 w-3" /> :
         tone === "red" ? <X className="h-3 w-3" strokeWidth={3} /> : "—"}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[12.5px] font-semibold truncate", side === "after" && tone === "red" && "line-through decoration-bad/50")}>
          {s.name}
        </div>
        <div className="tnum text-[10.5px] text-graphite-300 mt-0.5">
          {s.skipped && side === "after"
            ? (s.after_reason || "Skipped")
            : <>{arrival != null ? fmtClock(arrival) : "—"}{status ? ` · ${STATUS_LABEL[status] ?? status}` : ""}</>}
        </div>
        {side === "after" && tone !== "green" && !s.skipped && (
          <div className="mt-0.5 text-[11px] leading-snug text-graphite-200">{s.after_reason}</div>
        )}
      </div>
    </li>
  );
}

function Verdict({ r }: { r: StressResult }) {
  const survived  = r.verdict === "SURVIVED";
  const recovered = r.outcome === "RECOVERED";
  const good      = survived || recovered;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "border p-4",
        good ? "border-ok/30 bg-[rgba(34,197,94,0.05)]" : "border-bad/30 bg-[rgba(239,68,68,0.05)]"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("h-10 w-10 grid place-items-center", good ? "text-ok" : "text-bad")}>
            {survived ? <Shield className="h-6 w-6" /> : recovered ? <Wrench className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
          </div>
          <div>
            <div className={cn("font-display text-[20px] font-extrabold leading-tight", good ? "text-ok" : "text-bad")}>
              {survived ? "Plan survived" : recovered ? "Plan recovered" : r.outcome === "PARTIALLY_RECOVERED" ? "Partially recovered" : "Plan broken"}
            </div>
            <div className="eyebrow mt-0.5">{r.label}</div>
          </div>
        </div>
        <ProvenanceChip provenance="simulated" />
      </div>

      {!survived && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className={cn("text-[10px] font-bold px-2 py-1 border", good ? "border-ok/30 text-ok" : "border-bad/30 text-bad")}>
            {r.broken} break{r.broken !== 1 ? "s" : ""}
          </span>
          {r.recovery && (
            <>
              <ArrowRight className="h-3.5 w-3.5 text-graphite-400" />
              <span className={cn("text-[10px] font-bold px-2 py-1 border",
                recovered ? "border-ok/30 text-ok" : r.outcome === "PARTIALLY_RECOVERED" ? "border-warn/30 text-warn" : "border-bad/30 text-bad"
              )}>
                {recovered ? "Recovered" : r.outcome === "PARTIALLY_RECOVERED" ? "Partial" : "Not recoverable"}
              </span>
            </>
          )}
        </div>
      )}

      <p className="mt-3 text-[12.5px] leading-relaxed text-graphite-100">{r.explanation}</p>
      <p className="mt-1.5 text-[10px] text-graphite-300">
        {r.explanation_engine === "groq" ? "Explained by Groq" : "Deterministic rules"} · not a prediction
      </p>
    </motion.div>
  );
}

export default function StressPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["journey", id], queryFn: () => api.journey(id) });
  const j = q.data;
  const [active, setActive] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const autoRan = useRef(false);

  const sim = useMutation({ mutationFn: api.stress });
  const apply = useMutation({
    mutationFn: api.replan,
    onSuccess: (r) => { qc.setQueryData(["journey", id], r.journey); navigate(`/route/${id}`); },
  });
  const reset = useMutation({
    mutationFn: () => api.replan({ journey_id: id, reset_disruptions: true }),
    onSuccess: (r) => { qc.setQueryData(["journey", id], r.journey); sim.reset(); setActive(null); },
  });

  const run = (d: ScenarioDef, stop = stopId) => {
    if (!j) return;
    setActive(d.key);
    setWhyOpen(false);
    sim.mutate({ journey_id: id, scenario: d.scenario, minutes: d.minutes, stop_id: d.needsStop ? stop ?? j.waypoints[0]?.id ?? null : null });
  };

  useEffect(() => {
    if (j && params.get("auto") && !autoRan.current && j.waypoints.length) {
      autoRan.current = true;
      run(SCENARIOS.find((s) => s.key === "d45")!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j]);

  if (q.isLoading) return (
    <div className="min-h-dvh bg-canvas"><TopBar />
      <div className="mx-auto max-w-4xl space-y-3 p-4">
        {[28, 64, 40].map((h, i) => <div key={i} className="skeleton" style={{ height: `${h * 4}px` }} />)}
      </div>
    </div>
  );

  if (q.isError || !j)
    return (q.error as ApiError | null)?.status === 404
      ? <NotFound message="That route has expired." />
      : <NotFound message="Live search temporarily unavailable." />;

  const r   = sim.data;
  const err = (sim.error as ApiError | null) ?? (apply.error as ApiError | null);
  const rec = r?.recovery;
  const selectedStop = stopId ?? j.waypoints[0]?.id ?? null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-dvh bg-[#F8F7F3]">
      <TopBar mode={j.data_mode} since={timeAgo(j.created_at)} journeyId={id} />

      <main className="mx-auto max-w-[1100px] space-y-5 px-4 pb-24 pt-6 md:px-6">

        {/* Header */}
        <header>
          <Link to={`/route/${id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#667085] hover:text-[#151A23] mb-4">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to route
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="eyebrow text-[10px] text-[#F45B22] font-bold tracking-[0.14em] uppercase mb-1.5">PLAN STRESS TEST</div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-[#151A23] md:text-4xl">
                Break it on purpose.
              </h1>
              <p className="mt-2 max-w-xl text-sm text-[#667085]">
                {j.origin.name.split(",")[0]} → {j.destination.name.split(",")[0]} · {j.waypoints.length} stop{j.waypoints.length !== 1 ? "s" : ""}.
                Pick a disruption. We re-run the temporal graph and repair what breaks.
              </p>
            </div>
            <div className="flex items-center gap-3 border border-[#E4E2DC] p-3 rounded-[12px] bg-white shadow-sm">
              <div className="relative">
                <Ring score={r?.robustness_after ?? j.robustness.score} size={50} stroke={5} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="tnum text-xs font-bold text-[#151A23]">
                    {r?.robustness_after ?? j.robustness.score}
                  </span>
                </div>
              </div>
              <div>
                <div className="eyebrow text-[10px] text-[#667085]">ROBUSTNESS</div>
                <div className="tnum text-xs font-semibold text-[#151A23]">
                  {r ? <>{r.robustness_before}% <ArrowRight className="inline h-3 w-3 text-[#98A2B3]" /> <b className="text-[#F45B22]">{r.robustness_after}%</b></> : `${j.robustness.score}%`}
                </div>
              </div>
            </div>
          </div>
        </header>

        {j.waypoints.length === 0 ? (
          <div className="border border-[#E4E2DC] p-8 text-center text-[#667085] text-sm bg-white rounded-[12px]">
            No stops to stress-test. Switch to Experience mode first.
          </div>
        ) : (
          <>
            {/* ── Scenario selector ── */}
            <div className="border border-[#E4E2DC] bg-white rounded-[12px] overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#E4E2DC]">
                <div className="eyebrow text-[10px] text-[#667085]">SELECT DISRUPTION</div>
                {(j.state.delay_min > 0 || j.state.closed_ids.length > 0 || j.state.event_shift_min > 0) && (
                  <Button size="sm" variant="ghost" onClick={() => reset.mutate()} disabled={reset.isPending}>
                    {reset.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    Clear
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-px bg-[#E4E2DC] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                {SCENARIOS.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => run(d)}
                    disabled={sim.isPending}
                    className={cn(
                      "flex flex-col items-start gap-1.5 p-3 text-left transition-colors bg-white hover:bg-[#FAFAF8] cursor-pointer",
                      active === d.key && "bg-[#FFF4EF] outline outline-1 outline-[#F45B22]",
                      "disabled:opacity-60"
                    )}
                  >
                    <div className={cn(
                      "h-7 w-7 rounded-lg grid place-items-center border transition-colors",
                      active === d.key ? "border-[#F45B22] bg-[#FFF4EF] text-[#F45B22]" : "border-[#E4E2DC] bg-[#FAFAF8] text-[#667085]"
                    )}>
                      {sim.isPending && active === d.key
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <d.icon className="h-3.5 w-3.5" />}
                    </div>
                    <span className="text-[11px] font-bold text-[#151A23] leading-tight">{d.label}</span>
                    <span className="text-[10px] text-[#667085] font-medium">{d.hint}</span>
                    {d.demo && <span className="text-[8px] font-bold uppercase tracking-wider text-[#F45B22] border border-[#F45B22]/30 bg-[#FFF4EF] px-1 rounded-sm">DEMO</span>}
                  </button>
                ))}
              </div>

              {/* Stop picker */}
              <div className="px-4 py-3 border-t border-[#E4E2DC] bg-[#FAFAF8]">
                <div className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] font-bold mb-2">STOP TARGET (for closed / skip / overrun)</div>
                <div className="flex flex-wrap gap-1.5">
                  {j.waypoints.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => setStopId(w.id)}
                      aria-pressed={selectedStop === w.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold rounded-[8px] border transition-colors cursor-pointer",
                        selectedStop === w.id
                          ? "border-[#F45B22] bg-[#F45B22] text-white"
                          : "border-[#E4E2DC] bg-white text-[#151A23] hover:border-[#F45B22]"
                      )}
                    >
                      <span className={cn(
                        "h-4 w-4 rounded-full grid place-items-center text-[9px] font-bold",
                        selectedStop === w.id ? "bg-white/20 text-white" : "bg-[#F0EFEA] text-[#151A23]"
                      )}>
                        {w.order}
                      </span>
                      {w.name.length > 18 ? w.name.slice(0, 17) + "…" : w.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Error */}
            {err && (
              <div role="alert" className="border border-bad/30 bg-[#FDF2F2] p-3 text-[12px] text-bad rounded-xl">
                {err.message}
              </div>
            )}

            {/* Loading skeletons */}
            {sim.isPending && !r && (
              <div className="space-y-3">
                <div className="skeleton" style={{ height: "120px" }} />
                <div className="skeleton" style={{ height: "200px" }} />
              </div>
            )}

            <AnimatePresence mode="wait">
              {r && !r.applicable && (
                <motion.div key="na" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="border border-[#E4E2DC] bg-white rounded-xl p-6 text-center shadow-sm">
                  <p className="font-display text-[16px] font-bold text-[#151A23]">Not applicable</p>
                  <p className="mt-1 text-[12px] text-[#4B5563] font-medium">{r.note}</p>
                </motion.div>
              )}

              {r && r.applicable && (
                <motion.div key={r.label + r.verdict} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <Verdict r={r} />

                  {/* Before / After / Recovery */}
                  <div className={cn("grid gap-px bg-[#E4E2DC] border border-[#E4E2DC] rounded-xl overflow-hidden shadow-sm", rec ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
                    {/* Before */}
                    <div className="bg-white p-4">
                      <div className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] font-bold mb-3">CURRENT PLAN</div>
                      <ul>{r.stops.map((s) => <StopRow key={s.stop_id} s={s} side="before" />)}</ul>
                    </div>

                    {/* After disruption */}
                    <div className="bg-white p-4">
                      <div className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] font-bold mb-3 flex items-center gap-2">
                        AFTER {r.label.toUpperCase()}
                        <ProvenanceChip provenance="simulated" compact />
                      </div>
                      <ul>{r.stops.map((s) => <StopRow key={s.stop_id} s={s} side="after" />)}</ul>
                    </div>

                    {/* Recovery */}
                    {rec && (
                      <div className="bg-[#FFF4EF] p-4">
                        <div className="eyebrow text-[10px] tracking-[0.14em] font-bold mb-3 flex items-center gap-2 text-[#F45B22]">
                          <Wrench className="h-3 w-3" /> AUTO-RECOVERY
                        </div>

                        <div className="space-y-2">
                          {rec.ops.map((o, i) => (
                            <div key={i} className="border border-[#E4E2DC] bg-white rounded-lg p-3">
                              <div className="text-[10px] font-bold text-[#667085]">
                                {o.type === "replace" ? "REPLACED" : "DROPPED"}{" "}
                                <span className="line-through">{o.removed_name}</span>
                              </div>
                              {o.added ? (
                                <>
                                  <div className="mt-1 flex items-center gap-2 text-[13px] font-bold text-[#151A23]">
                                    <ArrowRight className="h-3.5 w-3.5 text-[#168A5B] shrink-0" />
                                    {o.added.name}
                                  </div>
                                  <div className="tnum mt-1 flex flex-wrap gap-x-3 text-[10.5px] text-[#4B5563] font-medium">
                                    <span>arrive <b>{fmtClock(o.arrival_min)}</b></span>
                                    <span>+{Math.round(o.detour_min ?? 0)}m detour</span>
                                  </div>
                                </>
                              ) : (
                                <p className="mt-1 text-[11.5px] text-[#667085] font-medium">No validated alternative.</p>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Recovery stats */}
                        <div className="mt-3 grid grid-cols-3 gap-px bg-[#E4E2DC] border border-[#E4E2DC] rounded-lg overflow-hidden">
                          {[
                            { label: "TRAVEL", value: `${rec.extra_travel_minutes >= 0 ? "+" : ""}${rec.extra_travel_minutes}m` },
                            { label: "KEPT",   value: `${rec.experiences_preserved}/${rec.experiences_total}` },
                            { label: "ARRIVE", value: fmtClock(rec.arrive_after_min, { short: true }) },
                          ].map((s) => (
                            <div key={s.label} className="bg-white p-2 text-center">
                              <div className="tnum text-[14px] font-bold text-[#151A23]">{s.value}</div>
                              <div className="eyebrow text-[9px] text-[#667085] font-bold mt-0.5">{s.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Why */}
                        <button onClick={() => setWhyOpen((w) => !w)} className="mt-3 text-[11px] font-bold text-[#F45B22] hover:underline cursor-pointer">
                          {whyOpen ? "Hide explanation" : "Why these replacements?"}
                        </button>
                        <AnimatePresence>
                          {whyOpen && (
                            <motion.p
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden pt-2 text-[11.5px] leading-relaxed text-[#2D3440] font-medium"
                            >
                              {rec.narrative}
                            </motion.p>
                          )}
                        </AnimatePresence>

                        <Button
                          variant="accent"
                          className="mt-4 w-full cursor-pointer"
                          onClick={() => apply.mutate({
                            journey_id: id,
                            apply_recovery: { journey_id: id, scenario: r.scenario as Scenario, minutes: r.minutes, stop_id: r.stop_id ?? undefined },
                          })}
                          disabled={apply.isPending}
                        >
                          {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                          APPLY RECOVERY
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Empty state */}
            {!r && !sim.isPending && (
              <div className="border border-[#E4E2DC] bg-white rounded-xl p-8 text-center shadow-sm">
                <div className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] font-bold mb-2">READY TO SIMULATE</div>
                <p className="text-[13px] text-[#4B5563] font-medium">
                  Try <b className="text-[#151A23] font-bold">+45 min delay</b> — the demo scenario.
                </p>
                <Button variant="accent" className="mt-4 cursor-pointer" onClick={() => run(SCENARIOS[1])}>
                  Simulate +45 min delay
                </Button>
              </div>
            )}
          </>
        )}

        <div className="pt-2 text-center">
          <Link to={`/route/${id}`} className="text-[11.5px] font-semibold text-[#667085] hover:text-[#151A23] transition-colors">
            ← Back to route
          </Link>
        </div>
      </main>
    </motion.div>
  );
}
