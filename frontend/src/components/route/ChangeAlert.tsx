import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, HelpCircle, Minus, Plus, X } from "lucide-react";
import type { RouteChange } from "@/lib/types";
import { fmtClock } from "@/lib/time";

export function ChangeAlert({ change, onDismiss }: { change: RouteChange; onDismiss: () => void }) {
  const [why, setWhy] = useState(false);
  const empty = !change.removed.length && !change.added.length && !change.retimed.length;
  return (
    <motion.div initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, height: 0 }} role="status" className="overflow-hidden rounded-2xl border border-accent-200 bg-accent-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent-600">{change.title}</div>
          <p className="mt-1 text-[14px] font-medium leading-snug text-ink">{change.message}</p>
        </div>
        <button onClick={onDismiss} aria-label="Dismiss" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-white"><X className="h-4 w-4" /></button>
      </div>
      {!empty && (
        <div className="mt-3 space-y-1.5">
          <AnimatePresence>
            {change.removed.map((r, i) => (
              <motion.div key={`r${r.id}`} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 * i }} className="flex items-start gap-2 text-[13px]">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bad text-white"><Minus className="h-3 w-3" strokeWidth={3} /></span>
                <span><b className="line-through decoration-bad/60">{r.name}</b>{r.reason && <span className="text-ink-500"> — {r.reason}</span>}</span>
              </motion.div>
            ))}
            {change.added.map((r, i) => (
              <motion.div key={`a${r.id}`} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 * (i + change.removed.length) }} className="flex items-center gap-2 text-[13px]">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ok text-white"><Plus className="h-3 w-3" strokeWidth={3} /></span>
                <b>{r.name}</b>
              </motion.div>
            ))}
            {change.retimed.slice(0, 4).map((r) => (
              <motion.div key={`t${r.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tnum flex items-center gap-2 pl-7 text-[12px] text-ink-600">
                {r.name}: {fmtClock(r.from)} <ArrowRight className="h-3 w-3" /> <b>{fmtClock(r.to)}</b>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      {change.why && (
        <>
          <button onClick={() => setWhy((w) => !w)} className="mt-3 flex items-center gap-1 text-[12.5px] font-bold text-accent-600"><HelpCircle className="h-3.5 w-3.5" /> Why?</button>
          <AnimatePresence>{why && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pt-1.5 text-[13px] leading-relaxed text-ink-700">{change.why}</motion.p>}</AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
