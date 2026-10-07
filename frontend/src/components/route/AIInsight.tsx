import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  kind: "temporal" | "route" | "recovery" | "warning";
  body: string;
  primaryAction?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

/** AIInsight — inline intelligence overlay. Not a chatbot. */
export function AIInsight({ kind, body, primaryAction, onDismiss }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="insight-enter border border-[#E4E2DC] bg-white rounded-xl p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow mb-1 text-[10px] tracking-[0.14em] text-[#F45B22] uppercase font-bold">
            {kind === "temporal"  ? "TEMPORAL INSIGHT" :
             kind === "route"     ? "ROUTE INSIGHT" :
             kind === "recovery"  ? "RECOVERY" : "WARNING"}
          </div>
          <p className="text-[12px] text-[#2D3440] font-medium leading-relaxed">{body}</p>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="shrink-0 text-[#667085] hover:text-[#151A23] transition-colors mt-0.5 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {primaryAction && (
        <button
          onClick={primaryAction.onClick}
          className="mt-2.5 text-[11px] font-bold text-[#F45B22] hover:text-[#D94A18] transition-colors cursor-pointer block"
        >
          {primaryAction.label}
        </button>
      )}
    </motion.div>
  );
}
