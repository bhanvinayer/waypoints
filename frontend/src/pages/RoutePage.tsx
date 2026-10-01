import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Clock, FlaskConical, Fuel, Loader2, MapPinned, RefreshCw, TriangleAlert, Waypoints } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { MapView } from "@/components/route/MapView";
import { TimeSlider } from "@/components/route/TimeSlider";
import { WaypointCard } from "@/components/route/WaypointCard";
import { Timeline } from "@/components/route/Timeline";
import { RobustnessCard } from "@/components/route/RobustnessRing";
import { ModeTabs, RouteComparison } from "@/components/route/RouteModes";
import { ChangeAlert } from "@/components/route/ChangeAlert";
import { SignalsStrip } from "@/components/route/SignalsStrip";
import { SegmentDiscover } from "@/components/route/SegmentDiscover";
import { StayFlights } from "@/components/route/StayFlights";
import { EvidenceSheet, type EvidenceTarget } from "@/components/route/EvidenceSheet";
import { TraceSheet } from "@/components/route/TraceSheet";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { CurrentSignal, ExperienceNode, JourneyResponse, RouteChange, RouteMode, SliceNode } from "@/lib/types";
import { fmtClock, fmtDuration, prettyDate, timeAgo, toHHMM } from "@/lib/time";
import { cn, plural } from "@/lib/utils";
import NotFound from "./NotFound";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Section({ title, eyebrow, children, aside }: { title: string; eyebrow?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
          <h2 className="font-display text-xl font-bold">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="min-h-dvh">
      <TopBar />
      <div className="lg:grid lg:grid-cols-[480px_1fr]">
        <div className="space-y-4 p-4"><div className="skeleton h-40" /><div className="skeleton h-24" /><div className="skeleton h-64" /></div>
        <div className="skeleton m-4 h-[50dvh] lg:h-[80dvh]" />
      </div>
    </div>
  );
}

export default function RoutePage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["journey", id], queryFn: () => api.journey(id) });
  const journey = q.data;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sliceMin, setSliceMin] = useState<number | null>(null);
  const [evidence, setEvidence] = useState<EvidenceTarget | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [change, setChange] = useState<RouteChange | null>(null);
  const [extra, setExtra] = useState<ExperienceNode[]>([]);
  const [pendingMode, setPendingMode] = useState<RouteMode | null>(null);
  const [departure, setDeparture] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    if (journey) {
      document.title = `${journey.origin.name.split(",")[0]} → ${journey.destination.name.split(",")[0]} · WAYPOINTS`;
      if (journey.change && journey.version > 1) setChange((c) => c ?? journey.change!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey?.journey_id, journey?.version]);

  const replan = useMutation({
    mutationFn: api.replan,
    onSuccess: (r) => {
      qc.setQueryData(["journey", id], r.journey);
      setChange(r.change);
      setSelectedId(null);
      setExtra([]);
      setDeparture(null);
    },
    onSettled: () => { setPendingMode(null); setActionId(null); },
  });
  const replanError = replan.error as ApiError | null;

  const debounced = useDebounced(sliceMin, 140);
  const sliceQ = useQuery({
    queryKey: ["slice", id, debounced, journey?.version],
    queryFn: () => api.slice(id, debounced!),
    enabled: debounced !== null && !!journey,
    placeholderData: keepPreviousData,
  });
  const sliceMap = useMemo(() => (sliceMin !== null && sliceQ.data ? new Map<string, SliceNode>(sliceQ.data.nodes.map((n) => [n.id, n])) : undefined), [sliceMin, sliceQ.data]);

  const allNodes = useMemo(() => {
    const m = new Map<string, ExperienceNode>();
    if (!journey) return m;
    [...journey.pool, ...journey.alternatives, ...extra, ...journey.waypoints].forEach((n) => m.set(n.id, n));
    return m;
  }, [journey, extra]);

  if (q.isLoading) return <Skeleton />;
  if (q.isError || !journey) {
    const e = q.error as ApiError | null;
    if (e?.status === 404) return <NotFound message="That route has expired or never existed. Build it again." />;
    return (
      <div className="min-h-dvh"><TopBar />
        <div className="mx-auto max-w-md p-8 text-center">
          <TriangleAlert className="mx-auto mb-3 h-8 w-8 text-bad" />
          <p className="font-semibold">{e?.message ?? "Live search temporarily unavailable."}</p>
          <Button className="mt-4" variant="accent" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" /> Retry</Button>
        </div>
      </div>
    );
  }

  const j: JourneyResponse = journey;
  const orderOf = Object.fromEntries(j.waypoints.map((w) => [w.id, w.order]));
  const nameOf = (nid: string) => allNodes.get(nid)?.name;
  const selectedNode = selectedId ? allNodes.get(selectedId) : null;
  const selectedIsStop = selectedId ? j.waypoints.some((w) => w.id === selectedId) : false;
  const dep = departure ?? toHHMM(j.state.start_min);
  const depChanged = dep !== toHHMM(j.state.start_min);

  const select = (nid: string | null, scroll = true) => {
    setSelectedId(nid);
    if (nid && scroll) requestAnimationFrame(() => document.getElementById(`card-${nid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const evidenceFor = (n: ExperienceNode): EvidenceTarget => {
    const sigIds = new Set(n.current_signals.map((s) => s.evidence_id));
    const items = [...n.evidence, ...j.evidence.filter((e) => sigIds.has(e.id) || (n.sunset_sensitive && e.id === "ev_sunset"))];
    return { title: n.name, eyebrow: `Evidence · ${n.role}`, items, reasons: n.reasons };
  };
  const evidenceForSignal = (s: CurrentSignal): EvidenceTarget => ({
    title: s.title, eyebrow: s.kind === "sunset" ? "Computed" : s.kind === "event" ? "Event" : "News signal",
    items: j.evidence.filter((e) => e.id === s.evidence_id),
  });

  const swapMode = (mode: RouteMode) => { setPendingMode(mode); replan.mutate({ journey_id: id, mode }); };
  const first = j.waypoints[0];
  const sinceText = timeAgo(j.created_at);

  return (
    <div className="min-h-dvh">
      <TopBar mode={j.data_mode} since={sinceText} onOpenTrace={() => setTraceOpen(true)} journeyId={id} />
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(400px,480px)_1fr]">
        {/* ------------------------------- map (top on phones, right on desktop) */}
        <div className="sticky top-14 z-30 order-1 bg-sand lg:order-2 lg:h-[calc(100dvh-56px)]">
          <div className="relative isolate h-[36dvh] lg:h-full">
            <MapView journey={j} selectedId={selectedId} onSelect={(nid) => select(nid)} slice={sliceMap} extra={extra} />
            <div className="pointer-events-none absolute left-3 top-3 z-[500] hidden gap-1.5 sm:flex">
              {[["green", "Strong"], ["yellow", "Conditional"], ["red", "Doesn't fit"], ["gray", "Alternative"]].map(([t, l]) => (
                <span key={t} className="flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10.5px] font-bold text-ink-600 shadow backdrop-blur">
                  <span className={cn("h-2 w-2 rounded-full", t === "green" ? "bg-ok" : t === "yellow" ? "bg-warn" : t === "red" ? "bg-bad" : "bg-ink-400")} />{l}
                </span>
              ))}
            </div>
            {replan.isPending && (
              <div className="absolute inset-0 z-[600] grid place-items-center bg-sand/50 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-float"><Loader2 className="h-4 w-4 animate-spin text-accent" /> Re-validating your route…</div>
              </div>
            )}
            <TimeSlider journey={j} value={sliceMin} onChange={setSliceMin} slice={sliceQ.data} loading={sliceQ.isFetching} className="hidden lg:absolute lg:inset-x-4 lg:bottom-4 lg:z-[500] lg:block" />
          </div>
          <div className="border-b border-line bg-sand p-2 lg:hidden">
            <TimeSlider journey={j} value={sliceMin} onChange={setSliceMin} slice={sliceQ.data} loading={sliceQ.isFetching} className="shadow-none" />
          </div>
        </div>

        {/* ------------------------------- panel */}
        <aside className="order-2 space-y-7 px-4 pb-24 pt-5 lg:order-1 lg:h-[calc(100dvh-56px)] lg:overflow-y-auto lg:px-6 scroll-thin">
          <header>
            <div className="eyebrow mb-1 flex items-center gap-1.5"><Waypoints className="h-3.5 w-3.5 text-accent" /> Your living route</div>
            <h1 className="font-display text-[34px] font-extrabold leading-none md:text-4xl">
              {j.origin.name.split(",")[0]} <ArrowRight className="mx-0.5 inline h-7 w-7 text-accent" /> {j.destination.name.split(",")[0]}
            </h1>
            <p className="mt-2 text-[14px] font-medium text-ink-600">
              {prettyDate(j.request.date)} · <span className="tnum">{fmtClock(j.state.start_min + j.state.delay_min)} → {fmtClock(j.arrive_min)}</span>
              {j.state.delay_min > 0 && <span className="ml-2 rounded-full bg-warn-50 px-2 py-0.5 text-[11px] font-bold text-[#8a6100]">+{j.state.delay_min} min delay applied</span>}
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {[
                { k: "Drive", v: fmtDuration(j.direct_minutes), icon: MapPinned },
                { k: "Detours", v: `+${j.total_detour_minutes}m`, icon: Fuel },
                { k: "Stops", v: String(j.waypoints.length), icon: Waypoints },
                { k: "Arrive", v: fmtClock(j.arrive_min, { short: true }), icon: Clock },
              ].map((s) => (
                <div key={s.k} className="rounded-2xl border border-line bg-white px-1 py-2.5">
                  <s.icon className="mx-auto mb-1 h-3.5 w-3.5 text-ink-400" />
                  <div className="tnum font-display text-[17px] font-extrabold leading-none">{s.v}</div>
                  <div className="eyebrow mt-1 !text-[9.5px]">{s.k}</div>
                </div>
              ))}
            </div>
            <div className="mt-4"><ModeTabs options={j.route_options} onSelect={swapMode} pending={pendingMode} /></div>
            <div className="mt-3 flex items-center gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5">
                <span className="eyebrow !text-[10px] whitespace-nowrap">Depart</span>
                <input type="time" value={dep} onChange={(e) => setDeparture(e.target.value)} className="tnum h-8 w-full bg-transparent text-sm font-semibold focus:outline-none" aria-label="Departure time" />
              </label>
              <Button size="sm" variant={depChanged ? "accent" : "outline"} disabled={!depChanged || replan.isPending} onClick={() => replan.mutate({ journey_id: id, start_time: dep })}>
                Update route
              </Button>
            </div>
          </header>

          {replanError && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-bad-100 bg-bad-50 p-3.5 text-[13px] text-bad">
              <span>{replanError.message}</span>
              <button className="shrink-0 font-bold underline" onClick={() => replan.reset()}>Dismiss</button>
            </div>
          )}
          {j.warnings.length > 0 && (
            <div className="rounded-2xl border border-warn-100 bg-warn-50 p-3 text-[12.5px] text-[#7a5600]">
              <b>Some live sources were unavailable:</b>
              <ul className="mt-1 list-disc pl-5">{j.warnings.slice(0, 4).map((w) => <li key={w}>{w}</li>)}</ul>
              <p className="mt-1 opacity-80">Nothing was invented to fill the gaps.</p>
            </div>
          )}

          <AnimatePresence>{change && <ChangeAlert key={change.title + change.message} change={change} onDismiss={() => setChange(null)} />}</AnimatePresence>

          <div>
            <h2 className="font-display text-2xl font-bold leading-tight">{j.narrative.headline}</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-600">{j.narrative.summary}</p>
            <p className="mt-1 text-[11px] text-ink-400">Written by {j.narrative.engine === "groq" ? "an open-source model on Groq, grounded in the evidence" : "deterministic templates"} · every number comes from the plan.</p>
          </div>

          <SignalsStrip signals={j.signals} onOpen={(s) => setEvidence(evidenceForSignal(s))} />
          <RobustnessCard r={j.robustness} />

          <Button asChild variant="ink" size="lg" className="w-full">
            <Link to={`/route/${id}/stress-test`}><FlaskConical className="h-5 w-5" /> Break my plan — run the stress test</Link>
          </Button>

          {selectedNode && !selectedIsStop && (
            <Section title="Selected on the map" eyebrow={selectedNode.temporal ? "Alternative" : "Place"}>
              <WaypointCard journeyId={id} node={selectedNode} selected onEvidence={() => setEvidence(evidenceFor(selectedNode))} onAdd={() => { setActionId(selectedNode.id); replan.mutate({ journey_id: id, add_place_id: selectedNode.id }); }} adding={actionId === selectedNode.id && replan.isPending} compact />
            </Section>
          )}

          <Section title="Timeline" eyebrow="Your day">
            <Timeline items={j.timeline} selectedId={selectedId} onSelect={(nid) => select(nid)} order={orderOf} />
          </Section>

          <Section title={j.waypoints.length ? "Waypoints" : "No stop beats its detour"} eyebrow="Why each stop made the cut" aside={<span className="text-xs font-semibold text-ink-500">{plural(j.waypoints.length, "stop")}</span>}>
            {j.waypoints.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm text-ink-600">
                For this style of trip nothing is worth leaving the road for. Try <b>Experience</b> or <b>Discovery</b> above, or move your departure time.
              </div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence initial={false}>
                  {j.waypoints.map((w, i) => (
                    <WaypointCard
                      journeyId={id}
                      key={w.id}
                      node={w}
                      index={i}
                      selected={selectedId === w.id}
                      onSelect={() => select(w.id, false)}
                      onEvidence={() => setEvidence(evidenceFor(w))}
                      onReplace={() => { setActionId(w.id); replan.mutate({ journey_id: id, replace_stop_id: w.id }); }}
                      replacing={actionId === w.id && replan.isPending}
                      nameOf={nameOf}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </Section>

          <Section title="Discover along the way" eyebrow="Route-aware search">
            <SegmentDiscover
              journey={j}
              onCandidates={setExtra}
              onEvidence={(n) => setEvidence(evidenceFor(n))}
              onAdd={(nid) => { setActionId(nid); replan.mutate({ journey_id: id, add_place_id: nid }); }}
              addingId={replan.isPending ? actionId : null}
              onSelect={(nid) => select(nid, false)}
              selectedId={selectedId}
            />
          </Section>

          <Section title="Compare routes" eyebrow="Same graph, five objectives">
            <RouteComparison options={j.route_options} onSelect={swapMode} pending={pendingMode} />
          </Section>

          <StayFlights stay={j.stay} flights={j.flights} destination={j.destination.name.split(",")[0]} />

          <footer className="pb-6 text-[11.5px] leading-relaxed text-ink-400">
            Route geometry: {j.route.geometry_source.replace(/_/g, " ")}. Travel times marked “estimated” are inferred from route geometry; “from Google Directions” are observed.
            {first && " Tap any pin or timeline row to focus it."}
          </footer>
        </aside>
      </div>

      <EvidenceSheet target={evidence} onClose={() => setEvidence(null)} />
      <TraceSheet journey={j} open={traceOpen} onClose={() => setTraceOpen(false)} />
    </div>
  );
}
