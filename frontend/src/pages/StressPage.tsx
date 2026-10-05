import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Ban, CalendarClock, Check, FastForward, Hourglass, Loader2, RotateCcw, Shield, ShieldAlert, SkipForward, Timer, TriangleAlert, Wrench, X, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { ProvenanceChip } from "@/components/ui/chips";
import { Ring } from "@/components/route/RobustnessRing";
import { api, ApiError } from "@/lib/api";
import type { Scenario, StressResult, StressStop, Tone, Waypoint } from "@/lib/types";
import { fmtClock, fmtDuration, timeAgo } from "@/lib/time";
import { cn, STATUS_LABEL } from "@/lib/utils";
import NotFound from "./NotFound";

interface ScenarioDef { key: string; scenario: Scenario; minutes: number; label: string; icon: typeof Timer; needsStop?: boolean; hint: string; demo?: boolean }

const SCENARIOS: ScenarioDef[] = [
  { key: "d30", scenario: "delay", minutes: 30, label: "+30 min delay", icon: Timer, hint: "Flight delayed, traffic, a late start" },
  { key: "d45", scenario: "delay", minutes: 45, label: "+45 min delay", icon: Hourglass, hint: "The demo scenario", demo: true },
  { key: "d60", scenario: "delay", minutes: 60, label: "+60 min delay", icon: FastForward, hint: "A really bad day" },
  { key: "closed", scenario: "stop_closed", minutes: 0, label: "Stop closed", icon: Ban, needsStop: true, hint: "A stop turns out to be shut" },
  { key: "event", scenario: "event_delayed", minutes: 30, label: "Event delayed", icon: CalendarClock, hint: "Event pushed by 30 min" },
  { key: "skip", scenario: "skip_stop", minutes: 0, label: "Skip current stop", icon: SkipForward, needsStop: true, hint: "You decide to skip one" },
  { key: "overrun", scenario: "stop_overrun", minutes: 30, label: "Stop runs 30 min long", icon: Zap, needsStop: true, hint: "You lose track of time" },
];

const toneIcon = (t: Tone) => (t === "green" ? <Check className="h-4 w-4" strokeWidth={3} /> : t === "yellow" ? <TriangleAlert className="h-4 w-4" /> : t === "red" ? <X className="h-4 w-4" strokeWidth={3} /> : <SkipForward className="h-3.5 w-3.5" />);
const toneBg = (t: Tone) => (t === "green" ? "bg-ok text-white" : t === "yellow" ? "bg-warn text-white" : t === "red" ? "bg-bad text-white" : "bg-ink-300 text-white");

function StopRow({ s, side }: { s: StressStop; side: "before" | "after" }) {
  const tone = side === "before" ? s.before_tone : s.after_tone;
  const arrival = side === "before" ? s.before_arrival_min : s.after_arrival_min;
  const status = side === "before" ? s.before_status : s.after_status;
  return (
    <li className="flex items-start gap-3">
      <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", toneBg(tone))}>{toneIcon(tone)}</span>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[14px] font-semibold", side === "after" && tone === "red" && "line-through decoration-bad/50")}>{s.name}</div>
        <div className="tnum text-[12px] text-ink-500">
          {s.skipped && side === "after" ? (s.after_reason || "Skipped") : <>{arrival != null ? fmtClock(arrival) : "—"}{status ? ` · ${STATUS_LABEL[status]}` : ""}</>}
        </div>
        {side === "after" && tone !== "green" && !s.skipped && <div className="mt-0.5 text-[12px] leading-snug text-ink-600">{s.after_reason}</div>}
      </div>
    </li>
  );
}

function Verdict({ r }: { r: StressResult }) {
  const survived = r.verdict === "SURVIVED";
  const recovered = r.outcome === "RECOVERED";
  const partial = r.outcome === "PARTIALLY_RECOVERED";
  const good = survived || recovered;
  const Icon = survived ? Shield : recovered ? Wrench : ShieldAlert;
  const title = survived ? "YOUR PLAN SURVIVED" : recovered ? "PLAN RECOVERED" : partial ? "PARTIALLY RECOVERED" : "PLAN BREAK DETECTED";
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className={cn("rounded-3xl p-5 md:p-6", good ? "bg-ok-50" : "bg-bad-50")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("grid h-12 w-12 place-items-center rounded-2xl text-white", good ? "bg-ok" : "bg-bad")}><Icon className="h-6 w-6" /></span>
          <div>
            <div className={cn("text-[11px] font-extrabold uppercase tracking-[0.14em]", good ? "text-ok" : "text-bad")}>{r.label}</div>
            <div className={cn("font-display text-2xl font-extrabold leading-tight md:text-3xl", good ? "text-ok" : "text-bad")}>{title}</div>
          </div>
        </div>
        <ProvenanceChip provenance="simulated" />
      </div>
      {!survived && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
          <span className="rounded-full bg-bad px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">Break detected</span>
          <span className="text-ink-700">{r.broken} stop{r.broken === 1 ? "" : "s"} no longer fit{r.broken === 1 ? "s" : ""}</span>
          {r.recovery && <><ArrowRight className="h-4 w-4 text-ink-400" /><span className="rounded-full bg-ok px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">{recovered ? "Recovered" : partial ? "Partly recovered" : "Not recoverable"}</span><span className="text-ink-700">{r.recovery.experiences_preserved} of {r.recovery.experiences_total} experiences kept</span></>}
        </div>
      )}
      <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-700">{r.explanation}</p>
      <p className="mt-2 text-[11.5px] text-ink-500">{r.explanation_engine === "groq" ? "Explained by an open-source model on Groq" : "Explained by deterministic rules"}. Deterministic scenario simulation over current search data — not a prediction of the future.</p>
    </motion.div>
  );
}

function WaypointMini({ w, tag }: { w: Waypoint; tag?: "new" }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white", w.tone === "green" ? "bg-ok" : w.tone === "yellow" ? "bg-warn" : "bg-bad")}>{w.order}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{w.name}</span>
      {tag === "new" && <span className="rounded-full bg-accent px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-white">new</span>}
      <span className="tnum shrink-0 text-[12px] font-semibold text-ink-500">{fmtClock(w.arrival_min, { short: true })}</span>
    </li>
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
  const reset = useMutation({ mutationFn: () => api.replan({ journey_id: id, reset_disruptions: true }), onSuccess: (r) => { qc.setQueryData(["journey", id], r.journey); sim.reset(); setActive(null); } });

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

  if (q.isLoading) return <div className="min-h-dvh"><TopBar /><div className="mx-auto max-w-5xl space-y-4 p-4"><div className="skeleton h-32" /><div className="skeleton h-64" /></div></div>;
  if (q.isError || !j) return (q.error as ApiError | null)?.status === 404 ? <NotFound message="That route has expired. Build it again." /> : <NotFound message="Live search temporarily unavailable." />;

  const r = sim.data;
  const err = (sim.error as ApiError | null) ?? (apply.error as ApiError | null);
  const rec = r?.recovery;
  const CAP = 120; // open-all-day places have hours of slack; cap so tight windows stay readable
  const chart = r?.stops.map((s) => ({ name: s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name, before: Math.min(CAP, Math.max(0, s.before_slack_min ?? CAP)), after: s.after_tone === "red" ? 0 : Math.min(CAP, Math.max(0, s.after_slack_min ?? CAP)), red: s.after_tone === "red" })) ?? [];
  const selectedStop = stopId ?? j.waypoints[0]?.id ?? null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-dvh">
      <TopBar mode={j.data_mode} since={timeAgo(j.created_at)} journeyId={id} />
      <main className="mx-auto max-w-[1180px] space-y-6 px-4 pb-24 pt-6 md:px-6 md:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow mb-1">Plan stress test · what if?</div>
            <h1 className="font-display text-4xl font-extrabold leading-none md:text-5xl">Break it on purpose.</h1>
            <p className="mt-3 max-w-2xl text-ink-600">{j.origin.name.split(",")[0]} → {j.destination.name.split(",")[0]} · {j.waypoints.length} stops. Pick a disruption: we re-run every arrival time, opening window and event window, then repair what breaks.</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
            <Ring score={r?.robustness_after ?? j.robustness.score} size={56} stroke={6} />
            <div>
              <div className="eyebrow">Plan robustness</div>
              <div className="tnum text-sm font-semibold">{r ? <>{r.robustness_before}% <ArrowRight className="mx-0.5 inline h-3.5 w-3.5" /> <b>{r.robustness_after}%</b></> : `${j.robustness.score}%`}</div>
            </div>
          </div>
        </header>

        {j.waypoints.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-ink-600">This route has no stops to stress-test. Switch to Experience mode first.</div>
        ) : (
          <>
            <section aria-label="Scenarios" className="card p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold">What if?</h2>
                {(j.state.delay_min > 0 || j.state.closed_ids.length > 0 || j.state.event_shift_min > 0) && (
                  <Button size="sm" variant="outline" onClick={() => reset.mutate()} disabled={reset.isPending}>{reset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Clear applied disruptions</Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {SCENARIOS.map((d) => (
                  <button key={d.key} onClick={() => run(d)} disabled={sim.isPending}
                    className={cn("group relative flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition active:scale-[0.97] disabled:opacity-60",
                      active === d.key ? "border-accent bg-accent-50 ring-2 ring-accent/20" : "border-line bg-white hover:border-ink-300", d.demo && active !== d.key && "border-accent-200")}>
                    <span className="flex w-full items-center justify-between">
                      <span className={cn("grid h-8 w-8 place-items-center rounded-xl", active === d.key ? "bg-accent text-white" : "bg-sand-200 text-ink-600")}>
                        {sim.isPending && active === d.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <d.icon className="h-4 w-4" />}
                      </span>
                      {d.demo && <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">Demo</span>}
                    </span>
                    <span className="text-[13.5px] font-bold uppercase leading-tight tracking-wide">{d.label}</span>
                    <span className="text-[11.5px] text-ink-500">{d.hint}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 border-t border-line pt-3">
                <div className="eyebrow mb-2">Stop for “closed / skip / overrun”</div>
                <div className="scroll-thin flex gap-1.5 overflow-x-auto pb-1">
                  {j.waypoints.map((w) => (
                    <button key={w.id} onClick={() => setStopId(w.id)} aria-pressed={selectedStop === w.id}
                      className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition", selectedStop === w.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-600 hover:border-ink-300")}>
                      <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold text-white", selectedStop === w.id ? "bg-white/25" : "bg-ink-400")}>{w.order}</span>
                      {w.name.length > 22 ? w.name.slice(0, 21) + "…" : w.name}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {err && (
              <div role="alert" className="rounded-2xl border border-bad-100 bg-bad-50 p-4 text-[13.5px] text-bad">
                {err.message} {err.retriable && <button className="font-bold underline" onClick={() => active && run(SCENARIOS.find((s) => s.key === active)!)}>Retry</button>}
              </div>
            )}

            {sim.isPending && !r && <div className="space-y-3"><div className="skeleton h-28" /><div className="skeleton h-64" /></div>}

            <AnimatePresence mode="wait">
              {r && !r.applicable && (
                <motion.div key="na" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-line bg-white p-6 text-center">
                  <p className="font-display text-lg font-bold">Not applicable to this route</p>
                  <p className="mt-1 text-sm text-ink-600">{r.note}</p>
                </motion.div>
              )}
              {r && r.applicable && (
                <motion.div key={r.label + r.verdict + (r.stop_id ?? "")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                  <Verdict r={r} />

                  <div className={cn("grid gap-4", rec ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
                    <section className="card p-4 md:p-5">
                      <h3 className="eyebrow mb-3">Original route</h3>
                      <ul className="space-y-3.5">{r.stops.map((s) => <StopRow key={s.stop_id} s={s} side="before" />)}</ul>
                    </section>
                    <section className="card p-4 md:p-5">
                      <h3 className="eyebrow mb-3 flex items-center gap-2">After {r.label.toLowerCase()} <ProvenanceChip provenance="simulated" compact /></h3>
                      <ul className="space-y-3.5">{r.stops.map((s) => <StopRow key={s.stop_id} s={s} side="after" />)}</ul>
                    </section>
                    {rec && (
                      <section className="card border-accent-200 bg-accent-50/40 p-4 md:p-5">
                        <h3 className="eyebrow mb-3 flex items-center gap-2 !text-accent-600"><Wrench className="h-3.5 w-3.5" /> Auto-recovery</h3>
                        <ul className="space-y-4">
                          {rec.ops.map((o, i) => (
                            <li key={i} className="rounded-2xl bg-white p-3.5 shadow-sm">
                              <div className="text-[12px] font-semibold text-ink-500">{o.type === "replace" ? "Replaced" : "Dropped"} <span className="line-through">{o.removed_name}</span></div>
                              {o.added ? (
                                <>
                                  <div className="mt-0.5 flex items-center gap-2 font-display text-[17px] font-bold leading-tight"><ArrowRight className="h-4 w-4 shrink-0 text-ok" />{o.added.name}</div>
                                  <div className="tnum mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-600">
                                    <span>arrive <b>{fmtClock(o.arrival_min)}</b></span>
                                    <span>{o.status ? STATUS_LABEL[o.status] : ""}</span>
                                    <span>+{Math.round(o.detour_min ?? 0)} min detour</span>
                                  </div>
                                </>
                              ) : <p className="mt-1 text-[13px] text-ink-600">No validated alternative at that point of the day.</p>}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl bg-white p-2"><div className="tnum font-display text-lg font-extrabold">{rec.extra_travel_minutes >= 0 ? "+" : ""}{rec.extra_travel_minutes}m</div><div className="eyebrow !text-[9px]">travel</div></div>
                          <div className="rounded-xl bg-white p-2"><div className="tnum font-display text-lg font-extrabold">{rec.experiences_preserved}/{rec.experiences_total}</div><div className="eyebrow !text-[9px]">preserved</div></div>
                          <div className="rounded-xl bg-white p-2"><div className="tnum font-display text-lg font-extrabold">{fmtClock(rec.arrive_after_min, { short: true })}</div><div className="eyebrow !text-[9px]">arrive</div></div>
                        </div>
                        <button onClick={() => setWhyOpen((w) => !w)} className="mt-3 text-[12.5px] font-bold text-accent-600">{whyOpen ? "Hide" : "Why?"}</button>
                        <AnimatePresence>{whyOpen && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pt-1 text-[13px] leading-relaxed text-ink-700">{rec.narrative}<span className="mt-1 block text-[11px] text-ink-500">{rec.narrative_engine === "groq" ? "Explained by Groq" : "Rule-based explanation"} · replacements validated by the temporal engine.</span></motion.p>}</AnimatePresence>
                        <Button variant="accent" size="lg" className="mt-4 w-full uppercase tracking-wide" onClick={() => apply.mutate({ journey_id: id, apply_recovery: { journey_id: id, scenario: r.scenario as Scenario, minutes: r.minutes, stop_id: r.stop_id ?? undefined } })} disabled={apply.isPending}>
                          {apply.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wrench className="h-5 w-5" />} Apply recovery
                        </Button>
                      </section>
                    )}
                  </div>

                  {rec && (
                    <section className="card p-4 md:p-6">
                      <h3 className="font-display text-xl font-bold">Original vs recovered</h3>
                      <p className="text-[13px] text-ink-500">Same journey, same day — before and after the disruption.</p>
                      <div className="mt-4 grid gap-6 md:grid-cols-2">
                        <div>
                          <div className="eyebrow mb-1">Original · arrives {fmtClock(rec.arrive_before_min)}</div>
                          <ul className="divide-y divide-line">{j.waypoints.map((w) => <WaypointMini key={w.id} w={w} />)}</ul>
                        </div>
                        <div>
                          <div className="eyebrow mb-1 !text-accent-600">Recovered · arrives {fmtClock(rec.arrive_after_min)}</div>
                          <ul className="divide-y divide-line">{rec.new_waypoints.map((w) => <WaypointMini key={w.id} w={w} tag={j.waypoints.some((o) => o.id === w.id) ? undefined : "new"} />)}</ul>
                        </div>
                      </div>
                    </section>
                  )}

                  <section className="card p-4 md:p-6">
                    <h3 className="font-display text-xl font-bold">Time buffer per stop</h3>
                    <p className="text-[13px] text-ink-500">Minutes of slack before each stop's window closes (capped at 2 h). Broken stops drop to zero. <ProvenanceChip provenance="simulated" compact /></p>
                    <div className="mt-4 h-60" role="img" aria-label="Bar chart of time buffer per stop before and after the disruption">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap={18}>
                          <CartesianGrid vertical={false} stroke="#E7E0D3" />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5B6F69" }} tickLine={false} axisLine={false} interval={0} />
                          <YAxis tick={{ fontSize: 11, fill: "#5B6F69" }} tickLine={false} axisLine={false} unit="m" domain={[0, CAP]} ticks={[0, 30, 60, 90, 120]} />
                          <Tooltip cursor={{ fill: "rgba(16,33,29,.05)" }} contentStyle={{ borderRadius: 12, border: "1px solid #E7E0D3", fontSize: 12 }} />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="before" name="Before" fill="#B6C1BD" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                          <Bar dataKey="after" name="After disruption" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                            {chart.map((c, i) => <Cell key={i} fill={c.red ? "#D3402F" : "#E8501C"} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                </motion.div>
              )}
            </AnimatePresence>

            {!r && !sim.isPending && (
              <div className="rounded-3xl border border-dashed border-line bg-white/60 p-8 text-center">
                <FastForward className="mx-auto mb-2 h-7 w-7 text-accent" />
                <p className="font-display text-lg font-bold">Pick a scenario above</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-600">Try <b>+45 min delay</b> — then watch WAYPOINTS find what breaks and repair it with a stop it has already validated.</p>
                <Button variant="accent" className="mt-4" onClick={() => run(SCENARIOS[1])}>Simulate +45 min delay</Button>
              </div>
            )}
          </>
        )}
        <div className="pt-2 text-center"><Link to={`/route/${id}`} className="text-sm font-semibold text-ink-500 underline-offset-4 hover:text-accent hover:underline">← Back to the route</Link></div>
      </main>
    </motion.div>
  );
}
