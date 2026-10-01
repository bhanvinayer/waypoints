import { ArrowDown, Bot, CheckCircle2, Cog, Database, Search, XCircle, Zap } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import type { JourneyResponse, TraceStep } from "@/lib/types";
import { cn, engineLabel } from "@/lib/utils";

const PHASE_ORDER = ["analyze", "plan", "route", "maps", "places", "reviews", "events", "news", "web", "stay", "flights", "directions", "curate", "narrate", "stress", "repair", "optimize"];
const PHASE_TITLE: Record<string, string> = {
  analyze: "Journey Analyst", plan: "Discovery Planner", route: "Route & corridor", maps: "Candidate search", places: "Place details", reviews: "Reviews",
  events: "Events", news: "News", web: "Web evidence", stay: "Stay", flights: "Flights", directions: "Travel-time validation", curate: "Experience Curator",
  narrate: "Trip Narrator", stress: "Stress Tester", repair: "Recovery Planner", optimize: "Route Optimizer",
};

function StepRow({ s }: { s: TraceStep }) {
  const Icon = s.kind === "serpapi" ? Search : s.kind === "llm" ? Bot : Cog;
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", s.kind === "serpapi" ? "bg-accent/20 text-accent-200" : s.kind === "llm" ? "bg-violet-400/20 text-violet-200" : "bg-white/10 text-white/70")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-bold">{s.kind === "serpapi" ? engineLabel(s.engine) : s.label}</span>
            {s.kind === "serpapi" && <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/60">engine={s.engine}</code>}
            {s.kind === "llm" && <span className="text-[11px] text-white/50">{s.mode === "rule-based" ? "rule-based fallback" : engineLabel(s.engine)}</span>}
            {s.cached && <span className="rounded-full bg-sky-400/20 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-sky-200">cached</span>}
            {s.kind === "serpapi" && s.mode === "demo" && <span className="rounded-full bg-warn/25 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-yellow-200">demo</span>}
          </div>
          {(s.query || s.detail) && <p className="mt-0.5 break-words text-[12px] text-white/60">{s.query ? `“${s.query}”` : s.detail}</p>}
          {s.error && <p className="mt-0.5 text-[12px] text-red-300">{s.error}</p>}
          <div className="tnum mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
            <span className="flex items-center gap-1">{s.ok ? <CheckCircle2 className="h-3 w-3 text-ok" /> : <XCircle className="h-3 w-3 text-bad" />}{s.latency_ms} ms</span>
            {s.results != null && <span>{s.results} result{s.results === 1 ? "" : "s"}</span>}
            <span>{new Date(s.started_at).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

export function TraceSheet({ journey, open, onClose }: { journey: JourneyResponse; open: boolean; onClose: () => void }) {
  const steps = journey.trace;
  const serp = steps.filter((s) => s.kind === "serpapi");
  const engines = new Set(serp.map((s) => s.engine));
  const totalMs = steps.reduce((a, s) => a + s.latency_ms, 0);
  const groups = PHASE_ORDER.map((p) => ({ p, list: steps.filter((s) => s.phase === p) })).filter((g) => g.list.length);
  const rest = steps.filter((s) => !PHASE_ORDER.includes(s.phase));
  if (rest.length) groups.push({ p: "other", list: rest });
  const live = journey.data_mode === "live";
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} eyebrow="Developer drawer" title="Live search trace" tone="dark" width="md:w-[560px]"
      description={live ? "Every fact in this route came through these SerpApi calls." : "Demo snapshot: SerpApi-shaped sample responses flow through the same pipeline."}>
      <div className="pb-8">
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: "SerpApi calls", v: serp.length, icon: Zap },
            { k: "From cache", v: serp.filter((s) => s.cached).length, icon: Database },
            { k: "Engines", v: engines.size, icon: Search },
            { k: "Total latency", v: `${(totalMs / 1000).toFixed(1)}s`, icon: Cog },
          ].map((m) => (
            <div key={m.k} className="rounded-xl bg-white/[0.06] p-3">
              <m.icon className="mb-1.5 h-4 w-4 text-accent-200" />
              <div className="tnum font-display text-xl font-bold leading-none">{m.v}</div>
              <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider text-white/45">{m.k}</div>
            </div>
          ))}
        </div>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {[...engines].map((e) => <span key={e} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/75">{engineLabel(e)}</span>)}
        </div>
        <ol className="space-y-1">
          {groups.map((g, gi) => (
            <li key={g.p}>
              <div className="mb-2 mt-3 flex items-center gap-2">
                <span className="rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider">{PHASE_TITLE[g.p] ?? g.p}</span>
                <span className="text-[11px] text-white/40">{g.list.length} step{g.list.length === 1 ? "" : "s"}</span>
              </div>
              <ul className="space-y-2">{g.list.slice(0, 14).map((s) => <StepRow key={s.id} s={s} />)}</ul>
              {g.list.length > 14 && <p className="mt-1 text-[11px] text-white/40">+ {g.list.length - 14} more</p>}
              {gi < groups.length - 1 && <div className="my-2 grid place-items-center text-white/25"><ArrowDown className="h-4 w-4" /></div>}
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-xl bg-white/[0.04] p-3 text-[12px] text-white/50">
          Then: temporal validation → route optimisation (5 objective functions) → stress test. Those run in the WAYPOINTS engine, deterministically, over the evidence above.
        </div>
      </div>
    </Sheet>
  );
}
