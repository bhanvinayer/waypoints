import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Clock, Fuel, Loader2, MapPinned,
  RefreshCw, TriangleAlert, Waypoints,
} from "lucide-react";
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
import { AIInsight } from "@/components/route/AIInsight";
import { BottomJourneyStrip } from "@/components/route/BottomJourneyStrip";
import { WhatIfDrawer } from "@/components/route/WhatIfDrawer";
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

function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      {label && <span className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] font-bold shrink-0">{label}</span>}
      <div className="flex-1 h-px bg-[#E4E2DC]" />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="min-h-dvh bg-[#F8F7F3]">
      <TopBar />
      <div className="lg:grid lg:grid-cols-[460px_1fr]">
        <div className="space-y-2 p-4">
          {[40, 24, 64, 40, 32].map((h, i) => (
            <div key={i} className="skeleton" style={{ height: `${h * 4}px` }} />
          ))}
        </div>
        <div className="skeleton m-4" style={{ height: "70dvh" }} />
      </div>
    </div>
  );
}

export default function RoutePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["journey", id], queryFn: () => api.journey(id) });
  const journey = q.data;

  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [sliceMin, setSliceMin]           = useState<number | null>(null);
  const [evidence, setEvidence]           = useState<EvidenceTarget | null>(null);
  const [traceOpen, setTraceOpen]         = useState(false);
  const [whatIfOpen, setWhatIfOpen]       = useState(false);
  const [change, setChange]               = useState<RouteChange | null>(null);
  const [extra, setExtra]                 = useState<ExperienceNode[]>([]);
  const [pendingMode, setPendingMode]     = useState<RouteMode | null>(null);
  const [departure, setDeparture]         = useState<string | null>(null);
  const [actionId, setActionId]           = useState<string | null>(null);
  const [insightDismissed, setInsightDismissed] = useState(false);

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
  const sliceMap = useMemo(
    () => sliceMin !== null && sliceQ.data
      ? new Map<string, SliceNode>(sliceQ.data.nodes.map((n) => [n.id, n]))
      : undefined,
    [sliceMin, sliceQ.data]
  );

  const allNodes = useMemo(() => {
    const m = new Map<string, ExperienceNode>();
    if (!journey) return m;
    [...journey.pool, ...journey.alternatives, ...extra, ...journey.waypoints].forEach((n) => m.set(n.id, n));
    return m;
  }, [journey, extra]);

  if (q.isLoading) return <Skeleton />;
  if (q.isError || !journey) {
    const e = q.error as ApiError | null;
    if (e?.status === 404) return <NotFound message="That route has expired. Build it again." />;
    return (
      <div className="min-h-dvh bg-canvas">
        <TopBar />
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <TriangleAlert className="h-8 w-8 text-bad" />
          <p className="text-[14px] text-graphite-100">{e?.message ?? "Live search temporarily unavailable."}</p>
          <Button variant="accent" onClick={() => q.refetch()}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const j: JourneyResponse = journey;
  const orderOf = Object.fromEntries(j.waypoints.map((w) => [w.id, w.order]));
  const nameOf = (nid: string) => allNodes.get(nid)?.name;
  const selectedNode   = selectedId ? allNodes.get(selectedId) : null;
  const selectedIsStop = selectedId ? j.waypoints.some((w) => w.id === selectedId) : false;
  const dep = departure ?? toHHMM(j.state.start_min);
  const depChanged = dep !== toHHMM(j.state.start_min);

  const select = (nid: string | null, scroll = true) => {
    setSelectedId(nid);
    if (nid && scroll)
      requestAnimationFrame(() =>
        document.getElementById(`card-${nid}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      );
  };

  const evidenceFor = (n: ExperienceNode): EvidenceTarget => {
    const sigIds = new Set(n.current_signals.map((s) => s.evidence_id));
    const items = [...n.evidence, ...j.evidence.filter((e) => sigIds.has(e.id))];
    return { title: n.name, eyebrow: `Evidence · ${n.role}`, items, reasons: n.reasons };
  };

  const evidenceForSignal = (s: CurrentSignal): EvidenceTarget => ({
    title: s.title,
    eyebrow: s.kind === "sunset" ? "Computed" : s.kind === "event" ? "Event" : "News signal",
    items: j.evidence.filter((e) => e.id === s.evidence_id),
  });

  const swapMode = (mode: RouteMode) => { setPendingMode(mode); replan.mutate({ journey_id: id, mode }); };
  const hasNarrativeHighlight = !insightDismissed && j.narrative.highlights.length > 0;

  return (
    <div className="min-h-dvh bg-[#F8F7F3] pb-10">
      <TopBar
        mode={j.data_mode}
        since={timeAgo(j.created_at)}
        onOpenTrace={() => setTraceOpen(true)}
        journeyId={id}
      />

      <div className="flex flex-col lg:grid lg:grid-cols-[460px_1fr]">

        {/* ── Map — right col on desktop, top on mobile ── */}
        <div className="sticky top-12 z-30 order-1 lg:order-2 lg:h-[calc(100dvh-48px)]">
          <div className="relative h-[42dvh] lg:h-full">
            <MapView
              journey={j}
              selectedId={selectedId}
              onSelect={(nid) => select(nid)}
              slice={sliceMap}
              extra={extra}
            />

            {/* Replanning overlay */}
            {replan.isPending && (
              <div className="absolute inset-0 z-[500] grid place-items-center bg-[rgba(255,255,255,0.7)] backdrop-blur-[2px]">
                <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#151A23] bg-white border border-[#E4E2DC] shadow-md rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-[#F45B22]" />
                  Re-validating route…
                </div>
              </div>
            )}

            {/* Timeline slider floating over map bottom (desktop) */}
            <TimeSlider
              journey={j}
              value={sliceMin}
              onChange={setSliceMin}
              slice={sliceQ.data}
              loading={sliceQ.isFetching}
              className="hidden lg:absolute lg:inset-x-3 lg:bottom-3 lg:z-[500] lg:block"
            />
          </div>

          {/* Timeline slider mobile — below map */}
          <div className="border-b border-[#E4E2DC] bg-[#F8F7F3] p-2 lg:hidden">
            <TimeSlider
              journey={j}
              value={sliceMin}
              onChange={setSliceMin}
              slice={sliceQ.data}
              loading={sliceQ.isFetching}
            />
          </div>
        </div>

        {/* ── Route panel — left col on desktop ── */}
        <aside className="order-2 lg:order-1 lg:h-[calc(100dvh-48px)] lg:overflow-y-auto scroll-thin bg-[#F8F7F3]">

          {/* Journey header */}
          <div className="px-5 pt-5 pb-4 border-b border-[#E4E2DC] bg-white">
            {/* Mode badge */}
            <div className="eyebrow text-[10px] text-[#667085] uppercase mb-2 font-bold tracking-[0.14em]">
              {j.data_mode === "demo" ? "DEMO ROUTE" : "YOUR ROUTE"}
            </div>

            {/* Origin → Destination */}
            <h1 className="font-display text-2xl font-bold leading-tight text-[#151A23]">
              {j.origin.name.split(",")[0]}
              <ArrowRight className="mx-2 inline h-5 w-5 text-[#F45B22]" />
              {j.destination.name.split(",")[0]}
            </h1>

            <p className="mt-1 tnum text-xs text-[#667085]">
              {prettyDate(j.request.date)} ·{" "}
              {fmtClock(j.state.start_min + j.state.delay_min)} → {fmtClock(j.arrive_min)}
              {j.state.delay_min > 0 && (
                <span className="ml-2 text-[#C77A16] font-bold">+{j.state.delay_min}m delay</span>
              )}
            </p>

            {/* Stats row */}
            <div className="mt-4 grid grid-cols-4 gap-px bg-[#E4E2DC] border border-[#E4E2DC] rounded-lg overflow-hidden">
              {[
                { k: "DRIVE",   v: fmtDuration(j.direct_minutes) },
                { k: "DETOUR",  v: `+${j.total_detour_minutes}m` },
                { k: "STOPS",   v: String(j.waypoints.length) },
                { k: "ARRIVE",  v: fmtClock(j.arrive_min, { short: true }) },
              ].map((s) => (
                <div key={s.k} className="bg-white px-2 py-2.5 text-center">
                  <div className="tnum text-sm font-bold text-[#151A23] leading-none">{s.v}</div>
                  <div className="eyebrow text-[9px] mt-1 text-[#667085]">{s.k}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Mode tabs */}
          <ModeTabs options={j.route_options} onSelect={swapMode} pending={pendingMode} />

          {/* Departure adjuster */}
          <div className="px-4 py-3 border-b border-[#E4E2DC] bg-white flex items-center gap-2">
            <span className="eyebrow text-[10px] text-[#667085] font-bold shrink-0">DEPART</span>
            <input
              type="time"
              value={dep}
              onChange={(e) => setDeparture(e.target.value)}
              className="tnum flex-1 bg-transparent text-[12px] font-semibold text-[#151A23] focus:outline-none"
              aria-label="Departure time"
            />
            <Button
              size="sm"
              variant={depChanged ? "accent" : "outline"}
              disabled={!depChanged || replan.isPending}
              onClick={() => replan.mutate({ journey_id: id, start_time: dep })}
              className="shrink-0"
            >
              Apply
            </Button>
          </div>

          {/* Content sections */}
          <div className="px-4 py-4 space-y-5">

            {/* Errors */}
            {replanError && (
              <div role="alert" className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-bad/30 bg-[#FDF2F2] text-[12px] text-bad">
                <span>{replanError.message}</span>
                <button className="shrink-0 font-bold" onClick={() => replan.reset()}>✕</button>
              </div>
            )}

            {/* Route change alert */}
            <AnimatePresence>
              {change && <ChangeAlert key={change.title} change={change} onDismiss={() => setChange(null)} />}
            </AnimatePresence>

            {/* AI narrative */}
            <div className="bg-white border border-[#E4E2DC] rounded-xl p-4 shadow-sm">
              <h2 className="text-[16px] font-bold text-[#151A23] leading-tight font-author">{j.narrative.headline}</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[#2D3440] font-medium">{j.narrative.summary}</p>
              <p className="mt-2 text-[10px] text-[#667085] font-medium">
                {j.narrative.engine === "groq" ? "Groq · grounded in evidence" : "Deterministic template"} · every number from the plan
              </p>
            </div>

            {/* AI insight */}
            <AnimatePresence>
              {hasNarrativeHighlight && (
                <AIInsight
                  kind="temporal"
                  body={j.narrative.highlights[0]}
                  primaryAction={{ label: "Run stress test →", onClick: () => navigate(`/route/${id}/stress-test`) }}
                  onDismiss={() => setInsightDismissed(true)}
                />
              )}
            </AnimatePresence>

            {/* Signals */}
            <SignalsStrip signals={j.signals} onOpen={(s) => setEvidence(evidenceForSignal(s))} />

            {/* Robustness */}
            <RobustnessCard r={j.robustness} journeyId={id} />

            {/* Stress test CTA */}
            <Link
              to={`/route/${id}/stress-test`}
              className="flex items-center justify-between p-4 rounded-xl border border-[#F45B22]/30 bg-[#FFF4EF] hover:bg-[#FDE3D8] transition-colors group shadow-sm"
            >
              <div>
                <div className="eyebrow text-[10px] text-[#F45B22] font-bold mb-0.5">STRESS TEST</div>
                <div className="text-[13px] font-bold text-[#151A23]">Break this plan on purpose</div>
              </div>
              <ArrowRight className="h-4 w-4 text-[#F45B22] group-hover:translate-x-0.5 transition-transform" />
            </Link>

            {/* Selected alternative */}
            {selectedNode && !selectedIsStop && (
              <>
                <Divider label="SELECTED ON MAP" />
                <WaypointCard
                  journeyId={id}
                  node={selectedNode}
                  selected
                  onEvidence={() => setEvidence(evidenceFor(selectedNode))}
                  onAdd={() => { setActionId(selectedNode.id); replan.mutate({ journey_id: id, add_place_id: selectedNode.id }); }}
                  adding={actionId === selectedNode.id && replan.isPending}
                  compact
                />
              </>
            )}

            {/* Timeline */}
            <Divider label="TIMELINE" />
            <div className="bg-white border border-[#E4E2DC] rounded-xl p-4 shadow-sm">
              <Timeline items={j.timeline} selectedId={selectedId} onSelect={(nid) => select(nid)} order={orderOf} />
            </div>

            {/* Waypoints */}
            <Divider label={`STOPS · ${plural(j.waypoints.length, "stop")}`} />
            {j.waypoints.length === 0 ? (
              <p className="text-[12px] text-[#667085] font-medium py-2">
                No stops beat the detour cost in this mode. Try Experience or Discovery.
              </p>
            ) : (
              <div className="border border-[#E4E2DC] bg-white rounded-xl overflow-hidden shadow-sm">
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

            {/* Route alternatives */}
            <Divider label="ROUTE MODES" />
            <RouteComparison options={j.route_options} onSelect={swapMode} pending={pendingMode} />

            {/* Corridor discover */}
            <Divider label="DISCOVER ALONG THE WAY" />
            <SegmentDiscover
              journey={j}
              onCandidates={setExtra}
              onEvidence={(n) => setEvidence(evidenceFor(n))}
              onAdd={(nid) => { setActionId(nid); replan.mutate({ journey_id: id, add_place_id: nid }); }}
              addingId={replan.isPending ? actionId : null}
              onSelect={(nid) => select(nid, false)}
              selectedId={selectedId}
            />

            {/* Stay + flights */}
            <StayFlights stay={j.stay[0] ?? null} flights={j.flights} destination={j.destination.name.split(",")[0]} />

            {/* Footer */}
            <p className="text-[10px] text-[#667085] font-medium pt-2 border-t border-[#E4E2DC]">
              Geometry: {j.route.geometry_source.replace(/_/g, " ")}
            </p>
          </div>
        </aside>
      </div>

      {/* Bottom strip */}
      <BottomJourneyStrip
        eta={fmtClock(j.arrive_min)}
        distanceKm={Math.round(j.route.distance_km)}
        stops={j.waypoints.length}
        detourMin={j.total_detour_minutes}
        robustness={{ label: j.robustness.label, score: j.robustness.score }}
        onWhatIf={() => setWhatIfOpen(true)}
        onStressTest={() => navigate(`/route/${id}/stress-test`)}
      />

      <EvidenceSheet target={evidence} onClose={() => setEvidence(null)} />
      <TraceSheet journey={j} open={traceOpen} onClose={() => setTraceOpen(false)} />
      <WhatIfDrawer open={whatIfOpen} onClose={() => setWhatIfOpen(false)} journey={j} />
    </div>
  );
}
