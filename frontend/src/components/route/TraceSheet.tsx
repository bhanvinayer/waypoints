import { AnimatePresence, motion } from "framer-motion";
import { X, Zap } from "lucide-react";
import type { JourneyResponse, TraceStep } from "@/lib/types";
import { formatMs, latencyColor, engineLabel, cn } from "@/lib/utils";

interface Props {
  journey: JourneyResponse;
  open: boolean;
  onClose: () => void;
}

export function TraceSheet({ journey, open, onClose }: Props) {
  const trace = journey.trace ?? [];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[600] bg-black/70"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-0 inset-y-0 z-[700] w-full max-w-md flex flex-col"
            style={{ background: "#080808", borderLeft: "1px solid #1A1A1A" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #111111" }}>
              <div>
                <div className="eyebrow mb-0.5" style={{ color: "#383838" }}>SEARCH TRACE</div>
                <div className="flex items-center gap-2">
                  <Zap className="h-3 w-3 text-accent" />
                  <span className="font-mono text-[12px] font-bold text-white tracking-wider">LIVE SEARCH LOG</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-7 w-7 grid place-items-center transition-colors"
                style={{ color: "#505050" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#505050")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Stats bar */}
            <div className="flex gap-6 px-4 py-2" style={{ borderBottom: "1px solid #111111", background: "#0A0A0A" }}>
              {[
                { label: "CALLS",    value: trace.length },
                { label: "CACHED",   value: trace.filter((t: TraceStep) => t.cached).length },
                { label: "AVG",      value: trace.length ? formatMs(Math.round(trace.reduce((a: number, t: TraceStep) => a + (t.latency_ms ?? 0), 0) / trace.length)) : "—" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#2A2A2A" }}>{s.label}</div>
                  <div className="tnum text-[13px] font-bold text-white">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-y-auto scroll-dark font-mono text-[11px]" style={{ background: "#080808" }}>
              {trace.length === 0 ? (
                <div className="px-4 py-8 text-center" style={{ color: "#2A2A2A" }}>No trace entries</div>
              ) : (
                trace.map((entry: TraceStep, i: number) => (
                  <div key={i} className="trace-enter px-4 py-2.5" style={{ borderBottom: "1px solid #0F0F0F", animationDelay: `${i * 0.015}s` }}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-2">
                        {entry.cached && (
                          <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5" style={{ color: "#383838", border: "1px solid #1A1A1A" }}>
                            CACHE
                          </span>
                        )}
                        <span className="font-bold text-accent">{engineLabel(entry.engine ?? "").toUpperCase()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {entry.results != null && (
                          <span style={{ color: "#2A2A2A" }}>{entry.results}r</span>
                        )}
                        {entry.latency_ms != null && (
                          <span className={cn("tnum", latencyColor(entry.latency_ms))}>{formatMs(entry.latency_ms)}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ color: "#707070" }}>{entry.query}</div>
                    {entry.started_at && (
                      <div className="mt-0.5 text-[9.5px] tnum" style={{ color: "#222" }}>
                        {new Date(entry.started_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="px-4 py-2 text-[9.5px]" style={{ borderTop: "1px solid #111111", background: "#0A0A0A", color: "#2A2A2A" }}>
              Key scrubbed · {journey.data_mode === "demo" ? "Demo snapshot" : "Live SerpApi data"}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
