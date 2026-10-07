import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpDown, Loader2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { nextSaturday } from "@/lib/time";
import type { JourneyRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

export const DEMO_REQUEST: JourneyRequest = {
  origin: "Delhi",
  destination: "Jaipur",
  date: nextSaturday(),
  start_time: "08:00",
  interests: ["Street Food", "Architecture"],
  travel_style: "food",
  travel_styles: ["food", "photography", "culture"],
  budget: "₹₹",
  demo: true,
  include_stay: true,
};

export function useStartDiscovery() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (req: JourneyRequest) => api.startDiscovery(req),
    onSuccess: (job, req) => {
      try { sessionStorage.setItem(`wp:req:${job.id}`, JSON.stringify(req)); } catch {}
      navigate(`/discover/${job.id}`, { state: { request: req } });
    },
  });
}

const INTERESTS = ["Culture", "Food", "History", "Photography", "Nature", "Architecture", "Markets"];

/**
 * RouteCommandBar — Single subtle white surface for editorial route planning.
 * Background: #FFFFFF, Border: 1px solid #E4E2DC, Radius: 12px.
 */
export function RouteCommandBar({ className }: { className?: string }) {
  const start = useStartDiscovery();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, retry: 0 });

  const [origin, setOrigin] = useState("Delhi");
  const [destination, setDestination] = useState("Jaipur");
  const [date, setDate] = useState(nextSaturday());
  const [time, setTime] = useState("08:00");
  const [interests, setInterests] = useState<string[]>(["Culture", "Food", "History"]);

  const toggleInterest = (v: string) =>
    setInterests((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const valid =
    origin.trim().length > 1 &&
    destination.trim().length > 1 &&
    origin.trim().toLowerCase() !== destination.trim().toLowerCase();

  const liveReady = health.data?.serpapi_configured ?? true;
  const error = start.error as ApiError | null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || start.isPending) return;
    start.mutate({
      origin: origin.trim(),
      destination: destination.trim(),
      date,
      start_time: time,
      interests,
      travel_style: interests[0]?.toLowerCase() ?? "experience",
      travel_styles: interests.map((i) => i.toLowerCase()),
      budget: "₹₹",
      demo: false,
      include_stay: true,
    });
  };

  return (
    <div className={cn("bg-white border border-[#E4E2DC] rounded-[12px] p-5 shadow-[0_2px_10px_rgba(20,25,35,0.04)]", className)}>
      <form onSubmit={submit} aria-label="Plan your journey" className="space-y-4">

        {/* ── Row 1: FROM / TO ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#E4E2DC] border border-[#E4E2DC] rounded-lg overflow-hidden">
          {/* FROM */}
          <div className="bg-white p-3 flex flex-col justify-center">
            <span className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] uppercase mb-1 font-bold">FROM</span>
            <input
              className="cmd-field text-sm font-semibold text-[#151A23] bg-white outline-none placeholder:text-[#98A2B3]"
              placeholder="Delhi"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              autoComplete="off"
              required
            />
          </div>

          {/* TO */}
          <div className="bg-white p-3 flex flex-col justify-center relative">
            <button
              type="button"
              onClick={() => { setOrigin(destination); setDestination(origin); }}
              className="absolute right-3 top-3 text-[#98A2B3] hover:text-[#151A23] transition-colors cursor-pointer"
              aria-label="Swap cities"
              title="Swap origin and destination"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </button>
            <span className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] uppercase mb-1 font-bold">TO</span>
            <input
              className="cmd-field text-sm font-semibold text-[#151A23] bg-white outline-none placeholder:text-[#98A2B3]"
              placeholder="Jaipur"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
        </div>

        {/* ── Row 2: DATE / DEPARTURE ── */}
        <div className="grid grid-cols-2 gap-px bg-[#E4E2DC] border border-[#E4E2DC] rounded-lg overflow-hidden">
          {/* DATE */}
          <div className="bg-white p-3 flex flex-col justify-center">
            <span className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] uppercase mb-1 font-bold">DATE</span>
            <input
              type="date"
              className="cmd-field text-xs font-semibold text-[#151A23] bg-white outline-none cursor-pointer"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* DEPARTURE */}
          <div className="bg-white p-3 flex flex-col justify-center">
            <span className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] uppercase mb-1 font-bold">DEPARTURE</span>
            <input
              type="time"
              className="cmd-field tnum text-xs font-semibold text-[#151A23] bg-white outline-none cursor-pointer"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
        </div>

        {/* ── Row 3: INTERESTS ── */}
        <div>
          <span className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] uppercase block mb-2 font-bold">INTERESTS</span>
          <div className="flex flex-wrap gap-1.5">
            {INTERESTS.map((item) => {
              const active = interests.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleInterest(item)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-[8px] border transition-colors cursor-pointer",
                    active
                      ? "bg-[#F45B22] border-[#F45B22] text-white"
                      : "bg-white border-[#DDDAD2] text-[#151A23] hover:border-[#F45B22]"
                  )}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Row 4: BUILD ROUTE BUTTON ── */}
        <button
          type="submit"
          disabled={!valid || start.isPending}
          className={cn(
            "w-full h-[50px] rounded-[10px] flex items-center justify-center gap-2",
            "text-xs font-bold uppercase tracking-wider text-white",
            "bg-[#F45B22] hover:bg-[#D94A18] transition-colors",
            "disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          )}
        >
          {start.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <>
              Build route <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        {/* Error message */}
        <AnimatePresence>
          {(!liveReady || error) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden pt-1"
            >
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-[#FEF7EC] border border-[#FCE7C5] text-[11px] text-[#C77A16]">
                <TriangleAlert className="h-3.5 w-3.5 text-[#C77A16] shrink-0 mt-0.5" />
                <span>
                  {error ? error.message : "No SERPAPI_KEY — live search unavailable. Try the demo."}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </form>
    </div>
  );
}

/** Minimal demo trigger link */
export function DemoButton({ className }: { className?: string }) {
  const start = useStartDiscovery();
  return (
    <button
      type="button"
      onClick={() => start.mutate({ ...DEMO_REQUEST, date: nextSaturday() })}
      disabled={start.isPending}
      className={cn(
        "flex items-center gap-1.5 text-xs font-semibold text-[#151A23]",
        "border border-[#E4E2DC] px-3.5 py-1.5 rounded-[8px] bg-white",
        "hover:border-[#F45B22] hover:text-[#F45B22] transition-colors cursor-pointer",
        "disabled:opacity-40",
        className
      )}
    >
      {start.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F45B22]" />}
      Delhi → Jaipur demo →
    </button>
  );
}

// Re-export PlanForm as RouteCommandBar alias for backward compat
export { RouteCommandBar as PlanForm };
