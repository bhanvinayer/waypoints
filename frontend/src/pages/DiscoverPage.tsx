import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { DataBadge } from "@/components/ui/chips";
import { useStartDiscovery } from "@/components/home/PlanForm";
import { WaypointsRouteTimeline } from "@/components/home/WaypointsRouteTimeline";
import { api, ApiError } from "@/lib/api";
import type { JourneyRequest } from "@/lib/types";

export default function DiscoverPage() {
  const { jobId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const restart = useStartDiscovery();
  const navigated = useRef(false);

  const request: JourneyRequest | null = (() => {
    const fromState = (location.state as { request?: JourneyRequest } | null)
      ?.request;
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
    refetchInterval: (q) =>
      q.state.data?.status === "running" || !q.state.data ? 550 : false,
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
          navigate(`/route/${data.journey_id}/stress-test?auto=1`, {
            replace: true,
          });
        } else {
          navigate(`/route/${data.journey_id}`, { replace: true });
        }
      }, 650);
      return () => clearTimeout(t);
    }
  }, [data, navigate]);

  const failed = data?.status === "error" || (job.isError && !data);
  const err = job.error as ApiError | null;
  const message =
    data?.error_message ?? err?.message ?? "Live search temporarily unavailable.";
  const retriable = data ? data.retriable : true;
  const title = request
    ? `${request.origin} → ${request.destination}`
    : "your journey";

  return (
    <div className="min-h-dvh">
      <TopBar mode={data?.data_mode} />

      {/* ── Page header ── */}
      <header className="mx-auto max-w-[1240px] px-4 pb-2 pt-10 md:px-6 md:pt-16">
        <div className="eyebrow mb-2">
          {failed ? "Something stopped us" : "Building your living route"}
        </div>
        <h1 className="font-display text-4xl font-extrabold leading-tight md:text-5xl">
          {failed ? "We couldn't finish this route." : title}
        </h1>
        {!failed && (
          <p className="mt-3 text-ink-600">
            Every step below is a real search or computation — nothing is staged.
          </p>
        )}
        {data && !failed && (
          <div className="mt-4">
            <DataBadge mode={data.data_mode} />
          </div>
        )}
      </header>

      {/* ── Timeline ── */}
      <AnimatePresence>
        {!failed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <WaypointsRouteTimeline stages={data?.stages} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error state ── */}
      {failed && (
        <div role="alert" className="mx-auto mt-6 max-w-2xl px-4 md:px-6">
          <div className="rounded-2xl border border-bad-100 bg-bad-50 p-5">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-bad" />
              <div>
                <p className="font-semibold text-bad">{message}</p>
                <p className="mt-1 text-sm text-ink-600">
                  We never fill gaps with made-up places or hours. Nothing was
                  shown as live that wasn't.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {request && retriable && (
                <Button
                  variant="accent"
                  onClick={() => restart.mutate(request)}
                  disabled={restart.isPending}
                >
                  {restart.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCw className="h-4 w-4" />
                  )}{" "}
                  Retry
                </Button>
              )}
              {request && !request.demo && (
                <Button
                  variant="outline"
                  onClick={() =>
                    restart.mutate({
                      ...request,
                      origin: "Delhi",
                      destination: "Jaipur",
                      demo: true,
                    })
                  }
                >
                  Try the demo journey
                </Button>
              )}
              <Button asChild variant="ghost">
                <Link to="/">Change journey</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
