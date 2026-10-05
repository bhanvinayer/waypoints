import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpDown, ChevronDown, Loader2, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { nextSaturday } from "@/lib/time";
import type { JourneyRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES = ["Fast", "Scenic", "Food", "Culture", "Nature", "Photography", "Adventure"];
const INTERESTS = ["Street Food", "Architecture", "Hidden Places", "Music", "Markets", "History"];
const BUDGETS = ["₹", "₹₹", "₹₹₹", "₹₹₹₹"];

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
      try {
        sessionStorage.setItem(`wp:req:${job.id}`, JSON.stringify(req));
      } catch {
        /* storage may be unavailable */
      }
      navigate(`/discover/${job.id}`, { state: { request: req } });
    },
  });
}

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-all active:scale-95",
        active ? "border-ink bg-ink text-white shadow-sm" : "border-line bg-white text-ink-600 hover:border-ink-300",
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-12 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] font-medium text-ink placeholder:text-ink-300 transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15";

export function PlanForm() {
  const start = useStartDiscovery();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, retry: 0 });
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(nextSaturday());
  const [time, setTime] = useState("08:00");
  const [endTime, setEndTime] = useState("");
  const [styles, setStyles] = useState<string[]>(["Food", "Culture"]);
  const [interests, setInterests] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [budget, setBudget] = useState("₹₹");
  const [advanced, setAdvanced] = useState(false);
  const [includeStay, setIncludeStay] = useState(true);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const addCustom = () => {
    const v = custom.trim();
    if (v && !interests.includes(v)) setInterests([...interests, v]);
    setCustom("");
  };

  const valid = origin.trim().length > 1 && destination.trim().length > 1 && origin.trim().toLowerCase() !== destination.trim().toLowerCase();
  const liveReady = health.data?.serpapi_configured ?? true;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || start.isPending) return;
    const s = styles.map((x) => x.toLowerCase());
    start.mutate({
      origin: origin.trim(),
      destination: destination.trim(),
      date,
      start_time: time,
      end_time: endTime || null,
      interests,
      travel_style: s[0] ?? "experience",
      travel_styles: s,
      budget,
      demo: false,
      include_stay: includeStay,
    });
  };

  const error = start.error as ApiError | null;

  return (
    <form onSubmit={submit} className="card relative overflow-hidden p-5 md:p-7" aria-label="Plan your journey">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Journey</div>
          <h2 className="font-display text-[28px] font-extrabold leading-none md:text-[34px]">Where are you going?</h2>
        </div>
        <div className="hidden rotate-3 rounded-xl bg-accent-50 px-3 py-2 text-right sm:block">
          <div className="text-[10px] font-bold uppercase tracking-wider text-accent-600">Route-aware</div>
          <div className="text-xs font-medium text-ink-600">not "things to do in…"</div>
        </div>
      </div>

      <div className="relative grid gap-3">
        <Field label="From">
          <input className={inputCls} placeholder="Delhi" value={origin} onChange={(e) => setOrigin(e.target.value)} autoComplete="off" required />
        </Field>
        <button
          type="button"
          onClick={() => { setOrigin(destination); setDestination(origin); }}
          className="absolute right-3 top-[66px] z-10 grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-ink-500 shadow-sm transition hover:text-accent active:rotate-180"
          aria-label="Swap origin and destination"
        >
          <ArrowUpDown className="h-4 w-4" />
        </button>
        <Field label="To">
          <input className={inputCls} placeholder="Jaipur" value={destination} onChange={(e) => setDestination(e.target.value)} autoComplete="off" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Start time">
            <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
      </div>

      <div className="mt-5">
        <span className="eyebrow mb-2 block">Travel style</span>
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => <Chip key={s} active={styles.includes(s)} onClick={() => toggle(styles, setStyles, s)}>{s}</Chip>)}
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
        <div>
          <span className="eyebrow mb-2 block">Budget</span>
          <div className="inline-flex rounded-full border border-line bg-white p-1" role="radiogroup" aria-label="Budget">
            {BUDGETS.map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={budget === b}
                onClick={() => setBudget(b)}
                className={cn("rounded-full px-3 py-1.5 text-[13px] font-bold transition", budget === b ? "bg-accent text-white" : "text-ink-500 hover:text-ink")}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow mb-2 block">Interests</span>
          <div className="flex flex-wrap gap-2">
            {[...INTERESTS, ...interests.filter((i) => !INTERESTS.includes(i))].map((s) => (
              <Chip key={s} active={interests.includes(s)} onClick={() => toggle(interests, setInterests, s)}>{s}</Chip>
            ))}
            <span className="flex items-center rounded-full border border-dashed border-ink-300 bg-white pl-3 pr-1">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                placeholder="add your own"
                className="w-24 bg-transparent py-1.5 text-[13px] font-medium placeholder:text-ink-300 focus:outline-none"
                aria-label="Add a custom interest"
              />
              <button type="button" onClick={addCustom} aria-label="Add interest" className="grid h-7 w-7 place-items-center rounded-full text-ink-500 hover:bg-sand-200">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        </div>
      </div>

      <button type="button" onClick={() => setAdvanced((a) => !a)} className="mt-5 flex items-center gap-1 text-[13px] font-semibold text-ink-500 hover:text-ink">
        Advanced preferences <ChevronDown className={cn("h-4 w-4 transition", advanced && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {advanced && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid gap-3 pt-3 sm:grid-cols-2">
              <Field label="Be at the destination by (optional)">
                <input type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </Field>
              <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm font-medium text-ink-600">
                <input type="checkbox" checked={includeStay} onChange={(e) => setIncludeStay(e.target.checked)} className="h-5 w-5 accent-[#E8501C]" />
                Suggest a place to stay (Google Hotels)
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!liveReady && (
        <div className="mt-4 flex gap-2 rounded-xl border border-warn-100 bg-warn-50 p-3 text-[13px] text-[#7a5600]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>The server has no <b>SERPAPI_KEY</b>, so live routes can't be built. Try the demo journey below, or add a key in <code>backend/.env</code>.</span>
        </div>
      )}
      {error && (
        <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-bad-100 bg-bad-50 p-3 text-[13px] text-bad">
          <span>{error.message}</span>
          {error.retriable && <button type="button" onClick={submit as any} className="shrink-0 font-bold underline">Retry</button>}
        </div>
      )}

      <Button type="submit" variant="accent" size="lg" className="mt-6 w-full uppercase tracking-wide" disabled={!valid || start.isPending}>
        {start.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Discover my route <ArrowRight className="h-5 w-5" /></>}
      </Button>
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-500">
        <Sparkles className="h-3.5 w-3.5 text-accent" /> Or jump straight in with the{" "}
        <DemoLink />
      </div>
    </form>
  );
}

function DemoLink() {
  const start = useStartDiscovery();
  return (
    <button type="button" onClick={() => start.mutate({ ...DEMO_REQUEST, date: nextSaturday() })} disabled={start.isPending} className="font-bold text-accent underline underline-offset-2 hover:text-accent-600 disabled:opacity-60">
      Delhi → Jaipur demo
    </button>
  );
}
