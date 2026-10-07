import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronRight, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { JourneyResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { key: "delay_30",  label: "Leave 30 min late",       scenario: "delay"       as const, minutes: 30 },
  { key: "delay_45",  label: "Leave 45 min late",        scenario: "delay"       as const, minutes: 45 },
  { key: "delay_60",  label: "Leave 60 min late",       scenario: "delay"       as const, minutes: 60 },
  { key: "closed",    label: "First stop closes early",  scenario: "stop_closed" as const, minutes: 0  },
  { key: "skip",      label: "Skip first stop",          scenario: "skip_stop"   as const, minutes: 0  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  journey: JourneyResponse;
}

export function WhatIfDrawer({ open, onClose, journey }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const navigate = useNavigate();

  const sim = useMutation({
    mutationFn: api.stress,
    onSuccess: () => {
      navigate(`/route/${journey.journey_id}/stress-test?auto=1`);
      onClose();
    },
  });

  const simulate = () => {
    if (!selected) return;
    const opt = OPTIONS.find((o) => o.key === selected)!;
    sim.mutate({
      journey_id: journey.journey_id,
      scenario: opt.scenario,
      minutes: opt.minutes,
      stop_id: (opt.scenario === "stop_closed" || opt.scenario === "skip_stop")
        ? journey.waypoints[0]?.id ?? null
        : null,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[600] bg-black/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-0 inset-y-0 z-[700] w-72 bg-base border-l border-[#2A2A2A] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1E1E]">
              <div>
                <div className="eyebrow mb-0.5">SIMULATION</div>
                <h2 className="font-mono text-[13px] font-bold text-white tracking-wide">WHAT IF?</h2>
              </div>
              <button onClick={onClose} className="h-7 w-7 grid place-items-center text-graphite-200 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Options */}
            <div className="flex-1 overflow-y-auto scroll-thin px-4 py-3">
              <p className="text-[11px] text-graphite-200 mb-3 leading-relaxed">
                Select a disruption. The temporal graph re-runs and shows what breaks — and how it's repaired.
              </p>
              <div className="space-y-1">
                {OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSelected(opt.key)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors border",
                      selected === opt.key
                        ? "border-accent/40 bg-[rgba(232,101,26,0.08)] text-white"
                        : "border-[#2A2A2A] bg-[#111111] text-graphite-100 hover:border-[#383838] hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full border shrink-0",
                        selected === opt.key ? "bg-accent border-accent" : "border-graphite-400"
                      )} />
                      <span className="text-[12px] font-semibold">{opt.label}</span>
                    </div>
                    <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", selected === opt.key ? "text-accent" : "text-graphite-400")} />
                  </button>
                ))}
              </div>
              {selected && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="sim-label">SIMULATED</span>
                  <span className="text-[10px] text-graphite-300">not applied until confirmed</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-[#1E1E1E] space-y-2">
              <Button variant="accent" className="w-full" disabled={!selected || sim.isPending} onClick={simulate}>
                {sim.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Simulating…</> : "SIMULATE"}
              </Button>
              <p className="text-[10px] text-graphite-300 text-center">Full stress test · shows recovery</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
