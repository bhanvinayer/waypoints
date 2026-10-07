import { motion } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import type { RouteChange } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChangeAlert({
  change,
  onDismiss,
}: {
  change: RouteChange;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      className="border border-accent/30 bg-[rgba(232,101,26,0.06)] p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow mb-1" style={{ color: "#E8651A" }}>JOURNEY CHANGED</div>
          <div className="text-[12px] font-bold text-white">{change.title}</div>
          <p className="mt-0.5 text-[11.5px] text-graphite-100 leading-relaxed">{change.message}</p>
        </div>
        <button onClick={onDismiss} className="shrink-0 text-graphite-300 hover:text-white transition-colors mt-0.5">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
