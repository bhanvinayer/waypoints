import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, RotateCw, SkipForward, TriangleAlert } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { DataBadge } from "@/components/ui/chips";
import { useStartDiscovery } from "@/components/home/PlanForm";
import { api, ApiError } from "@/lib/api";
import type { JourneyRequest, StageInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

function StageRow({ s, index }: { s: StageInfo; index: number }) {
  const done = s.status === "done" || s.status === "skipped";
  const running = s.status === "running";
  const error = s.status === "error";
  return (
    <motion.li initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="flex items-start gap-3.5">
      <span
        className={cn(
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-all duration-300",
          done && "border-ok bg-ok text-white",
          running && "border-accent bg-accent-50 text-accent",
          error && "border-bad bg-bad text-white",
          s.status === "pending" && "border-line bg-white text-ink-300",
        )}
      >
        {done ? (s.status === "skipped" ? <SkipForward className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" strokeWidth={3} />) : running ? <Loader2 className="h-4 w-4 animate-spin" /> : error ? <TriangleAlert className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <div className="min-w-0 flex-1 border-b border-line/70 pb-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn("font-semibold transition-colors", s.status === "pending" ? "text-ink-300" : "text-ink")}>{s.label}</span>
          {s.duration_ms != null && done && <span className="tnum shrink-0 text-xs text-ink-400">{(s.duration_ms / 1000).toFixed(1)}s</span>}
        </div>
        <AnimatePresence>
          {s.detail && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className={cn("text-[13px]", error ? "text-bad" : "text-ink-500")}>
              {s.detail}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

export default function DiscoverPage() {
  const { jobId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const restart = useStartDiscovery();
  const navigated = useRef(false);

  const request: JourneyRequest | null = (() => {
    const fromState = (location.state as any)?.request as JourneyRequest | undefined;
    if (fromState) return fromState;
    try {
      const raw = sessionStorage.getItem(`wp:req:${jobId}`);
      return raw ? (JSON.parse(raw) as JourneyRequest) : null;
    } catch {
      return null;
    }
  })();

  const job = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.job(jobId),
    refetchInterval: (q) => (q.state.data?.status === "running" || !q.state.data ? 550 : false),
    retry: 3,
  });

  const data = job.data;
  useEffect(() => {
    if (data?.status === "done" && data.journey_id && !navigated.current) {
      navigated.current = true;
      const auto = sessionStorage.getItem("wp:autostress");
      const t = setTimeout(() => {
        if (auto) {
          sessionStorage.removeItem("wp:autostress");
          navigate(`/route/${data.journey_id}/stress-test?auto=1`, { replace: true });
        } else navigate(`/route/${data.journey_id}`, { replace: true });
      }, 650);
      return () => clearTimeout(t);
    }
  }, [data, navigate]);

  const failed = data?.status === "error" || (job.isError && !data);
  const err = job.error as ApiError | null;
  const message = data?.error_message ?? err?.message ?? "Live search temporarily unavailable.";
  const retriable = data ? data.retriable : true;
  const doneCount = data?.stages.filter((s) => s.status === "done" || s.status === "skipped").length ?? 0;
  const total = data?.stages.length ?? 8;
  const title = request ? `${request.origin} → ${request.destination}` : "your journey";

  return (
    <div className="min-h-dvh">
      <TopBar mode={data?.data_mode} />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-10 md:pt-16">
        <div className="mb-8">
          <div className="eyebrow mb-2">{failed ? "Something stopped us" : "Building your living route"}</div>
          <h1 className="font-display text-4xl font-extrabold leading-tight md:text-5xl">{failed ? "We couldn't finish this route." : title}</h1>
          {!failed && <p className="mt-3 text-ink-600">Every step below is a real search or computation — nothing is staged.</p>}
          {data && !failed && <div className="mt-4"><DataBadge mode={data.data_mode} /></div>}
        </div>

        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-sand-200">
          <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${(doneCount / total) * 100}%` }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
        </div>

        <div className="card p-5 md:p-7">
          {data ? (
            <ol className="space-y-3.5">{data.stages.map((s, i) => <StageRow key={s.key} s={s} index={i} />)}</ol>
          ) : (
            <div className="space-y-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-9" />)}</div>
          )}
        </div>

        {failed && (
          <div role="alert" className="mt-6 rounded-2xl border border-bad-100 bg-bad-50 p-5">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-bad" />
              <div>
                <p className="font-semibold text-bad">{message}</p>
                <p className="mt-1 text-sm text-ink-600">We never fill gaps with made-up places or hours. Nothing was shown as live that wasn't.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {request && retriable && (
                <Button variant="accent" onClick={() => restart.mutate(request)} disabled={restart.isPending}>
                  {restart.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />} Retry
                </Button>
              )}
              {request && !request.demo && (
                <Button variant="outline" onClick={() => restart.mutate({ ...request, origin: "Delhi", destination: "Jaipur", demo: true })}>Try the demo journey</Button>
              )}
              <Button asChild variant="ghost"><Link to="/">Change journey</Link></Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
