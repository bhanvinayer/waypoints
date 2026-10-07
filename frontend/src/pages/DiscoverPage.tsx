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

function StageRow({ s, index, isLast }: { s: StageInfo; index: number; isLast: boolean }) {
  const done    = s.status === "done" || s.status === "skipped";
  const running = s.status === "running";
  const error   = s.status === "error";

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 280, damping: 28 }}
      className="relative flex items-stretch gap-4"
    >
      {/* Thread column */}
      <div className="flex w-6 shrink-0 flex-col items-center self-stretch">
        {/* Line above */}
        {index > 0 ? (
          <div className={cn("w-px h-3 shrink-0", done ? "bg-[#168A5B]" : "bg-[#E4E2DC]")} />
        ) : <div className="h-3" />}

        {/* Node */}
        <div className={cn(
          "h-6 w-6 rounded-full grid place-items-center border shrink-0 transition-all duration-300",
          done    && "border-[#168A5B] bg-[#E6F4ED] text-[#168A5B]",
          running && "border-[#F45B22] bg-[#FFF4EF] text-[#F45B22]",
          error   && "border-[#C94A4A] bg-[#FDF2F2] text-[#C94A4A]",
          !done && !running && !error && "border-[#E4E2DC] bg-[#FAFAF8] text-[#98A2B3]"
        )}>
          {done ? (
            s.status === "skipped"
              ? <SkipForward className="h-3 w-3" />
              : <Check className="h-3 w-3" strokeWidth={3} />
          ) : running ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : error ? (
            <TriangleAlert className="h-3 w-3" />
          ) : (
            <div className="h-1.5 w-1.5 rounded-full bg-[#98A2B3]" />
          )}
        </div>

        {/* Line below */}
        {!isLast && (
          <div className={cn("w-px flex-1 min-h-[10px]", done ? "bg-[#168A5B]/40" : "bg-[#E4E2DC]")} />
        )}
      </div>

      {/* Content */}
      <div className={cn("flex-1 min-w-0 pb-4", isLast && "pb-0")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn(
            "font-semibold text-[13px] transition-colors",
            done    ? "text-[#151A23]" :
            running ? "text-[#151A23] font-bold" :
            error   ? "text-[#C94A4A]" : "text-[#667085]"
          )}>
            {s.label}
          </span>
          {s.duration_ms != null && done && (
            <span className="tnum shrink-0 text-[10px] text-[#667085] font-mono font-medium">
              {(s.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <AnimatePresence>
          {s.detail && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className={cn("text-[11.5px] mt-0.5 font-medium", error ? "text-[#C94A4A]" : "text-[#4B5563]")}
            >
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
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();

  const job = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.job(jobId),
    refetchInterval: (q) => q.state.data?.status === "running" || !q.state.data ? 550 : false,
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
        } else {
          navigate(`/route/${data.journey_id}`, { replace: true });
        }
      }, 500);
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-dvh bg-[#F8F7F3]"
    >
      <TopBar mode={data?.data_mode} />

      <main className="mx-auto max-w-xl px-4 pb-16 pt-8 md:pt-12">

        {/* Header */}
        <div className="mb-6">
          {data && !failed && <div className="mb-3"><DataBadge mode={data.data_mode} /></div>}
          <div className="eyebrow mb-2 text-[10px] tracking-[0.14em] text-[#667085] uppercase font-bold">
            {failed ? "PIPELINE FAILED" : "BUILDING ROUTE"}
          </div>
          <h1 className="font-display text-[32px] font-bold leading-tight text-[#151A23] md:text-[38px] font-author">
            {failed ? "Route failed." : title}
          </h1>
          {!failed && (
            <p className="mt-1.5 text-[13px] text-[#4B5563] font-medium">
              Each step below is a real search or computation — not staged.
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-5 h-1 rounded-full overflow-hidden bg-[#E4E2DC]">
          <motion.div
            className="h-full bg-[#F45B22]"
            animate={{ width: `${(doneCount / total) * 100}%` }}
            transition={{ type: "spring", stiffness: 80, damping: 18 }}
          />
        </div>

        {/* Pipeline */}
        <div className="bg-white border border-[#E4E2DC] rounded-xl p-6 shadow-sm">
          {data ? (
            <ol className="space-y-0">
              {data.stages.map((s, i) => (
                <StageRow key={s.key} s={s} index={i} isLast={i === data.stages.length - 1} />
              ))}
            </ol>
          ) : (
            <div className="space-y-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="skeleton h-6 w-6" />
                  <div className="skeleton h-3 flex-1" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error state */}
        {failed && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="mt-5 border border-bad/30 bg-[rgba(239,68,68,0.06)] p-4"
          >
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
              <div>
                <p className="font-semibold text-bad text-[13px]">{message}</p>
                <p className="mt-1 text-[12px] text-graphite-200">
                  We never fill gaps with invented data. Nothing was shown as live that wasn't.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {request && retriable && (
                <Button variant="accent" onClick={() => restart.mutate(request)} disabled={restart.isPending}>
                  {restart.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                  Retry
                </Button>
              )}
              {request && !request.demo && (
                <Button variant="outline" onClick={() => restart.mutate({ ...request, origin: "Delhi", destination: "Jaipur", demo: true })}>
                  Try demo journey
                </Button>
              )}
              <Button asChild variant="ghost"><Link to="/">Change journey</Link></Button>
            </div>
          </motion.div>
        )}

        {/* Done state */}
        {data?.status === "done" && !failed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-4 border border-ok/30 bg-[rgba(34,197,94,0.06)] p-3 text-center"
          >
            <div className="flex items-center justify-center gap-2 text-[12px] font-bold text-ok">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
              Route built — opening journey
            </div>
          </motion.div>
        )}
      </main>
    </motion.div>
  );
}
