import { motion } from "framer-motion";
import type { TimelineItem } from "@/lib/types";
import { fmtClock, fmtDuration } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Props {
  items: TimelineItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  order: Record<string, number>;
}

/**
 * Timeline — journey thread visual.
 * Thin vertical line connecting stops — the Waypoints signature motif.
 */
export function Timeline({ items, selectedId, onSelect, order }: Props) {
  return (
    <div className="relative">
      {items.map((item, i) => {
        const isStop = item.kind === "stop";
        const isSelected = selectedId === item.node_id;
        const isFirst = i === 0;
        const isLast = i === items.length - 1;
        const tone = item.tone ?? "gray";

        return (
          <motion.div
            key={item.id ?? i}
            initial={{ opacity: 0, x: -3 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.15 }}
            className="flex items-stretch gap-3"
          >
            {/* Thread column */}
            <div className="flex flex-col items-center w-5 shrink-0">
              {/* Line above */}
              {!isFirst && (
                <div className={cn(
                  "w-px flex-none",
                  tone === "green" ? "h-3 bg-[#168A5B]" :
                  tone === "yellow" ? "h-3 bg-[#C77A16]" :
                  tone === "red" ? "h-3 bg-[#C94A4A]" : "h-3 bg-[#E4E2DC]"
                )} />
              )}
              {isFirst && <div className="h-3" />}

              {/* Node */}
              {isStop ? (
                <button
                  onClick={() => item.node_id && onSelect(item.node_id)}
                  className={cn(
                    "thread-node shrink-0 transition-all cursor-pointer",
                    tone === "green"  ? "ok" :
                    tone === "yellow" ? "warn" :
                    tone === "red"    ? "bad" :
                    isSelected        ? "active" : ""
                  )}
                  style={{ width: "20px", height: "20px", fontSize: "9px" }}
                >
                  {order[item.node_id ?? ""] ?? "·"}
                </button>
              ) : (
                <div
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: "#98A2B3" }}
                />
              )}

              {/* Line below */}
              {!isLast && (
                <div className="w-px flex-1 min-h-[8px]" style={{ background: "#E4E2DC" }} />
              )}
            </div>

            {/* Content */}
            <div
              className={cn(
                "flex-1 min-w-0 pb-3",
                isLast && "pb-0",
                isStop && item.node_id && "cursor-pointer"
              )}
              onClick={() => isStop && item.node_id && onSelect(item.node_id)}
            >
              {/* Time */}
              <div className="tnum text-[10px] text-[#667085] font-semibold mb-0.5">{fmtClock(item.start_min)}</div>

              {/* Label */}
              <div className={cn(
                "text-[12px] font-bold leading-tight",
                isStop
                  ? tone === "red" ? "text-[#C94A4A] line-through" : isSelected ? "text-[#F45B22]" : "text-[#151A23]"
                  : "text-[#4B5563]"
              )}>
                {item.title}
              </div>

              {/* Detail */}
              {item.subtitle && (
                <div className="tnum text-[10.5px] text-[#667085] font-medium mt-0.5">{item.subtitle}</div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
