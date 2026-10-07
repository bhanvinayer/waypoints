import { AnimatePresence, motion } from "framer-motion";
import { X, Link as LinkIcon } from "lucide-react";
import type { Evidence, Reason } from "@/lib/types";
import { ProvenanceChip } from "@/components/ui/chips";
import { engineLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface EvidenceTarget {
  title: string;
  eyebrow?: string;
  items: Evidence[];
  reasons?: Reason[];
}

interface Props {
  target: EvidenceTarget | null;
  onClose: () => void;
}

export function EvidenceSheet({ target, onClose }: Props) {
  return (
    <AnimatePresence>
      {target && (
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
            className="fixed right-0 inset-y-0 z-[700] w-full max-w-sm flex flex-col bg-base border-l border-[#2A2A2A]"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-4 py-3 border-b border-[#1E1E1E]">
              <div className="min-w-0 pr-3">
                {target.eyebrow && <div className="eyebrow mb-1">{target.eyebrow}</div>}
                <h2 className="text-[14px] font-bold text-white leading-tight">{target.title}</h2>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 h-7 w-7 grid place-items-center text-graphite-200 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scroll-thin">
              {/* Why list */}
              {target.reasons && target.reasons.length > 0 && (
                <div className="px-4 py-3 border-b border-[#1E1E1E]">
                  <div className="eyebrow mb-2">WHY THIS STOP</div>
                  <ul className="space-y-1.5">
                    {target.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-graphite-100">
                        <span className="status-dot open mt-1.5 shrink-0" />
                        {r.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Evidence items */}
              <div className="px-4 py-3">
                <div className="eyebrow mb-3">
                  EVIDENCE · {target.items.length} SOURCE{target.items.length !== 1 ? "S" : ""}
                </div>
                {target.items.length === 0 ? (
                  <p className="text-[12px] text-graphite-300">No evidence items available.</p>
                ) : (
                  <div className="space-y-3">
                    {target.items.map((item, i) => (
                      <EvidenceItemRow key={item.id ?? i} item={item} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function EvidenceItemRow({ item }: { item: Evidence }) {
  return (
    <div className="border-b border-[#1A1A1A] pb-3 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-bold text-graphite-200 uppercase tracking-wider">
          {engineLabel(item.source) || item.kind?.replace(/_/g, " ") || "Source"}
        </span>
        <ProvenanceChip provenance={item.provenance} compact />
      </div>
      {item.title && (
        <div className="text-[12px] font-semibold text-white mb-1 leading-tight">{item.title}</div>
      )}
      {item.detail && (
        <p className="text-[11.5px] text-graphite-100 leading-relaxed">{item.detail}</p>
      )}
      {item.publisher && (
        <div className="mt-1 text-[11px] text-graphite-100">
          Publisher: <span className="font-bold text-white">{item.publisher}</span>
        </div>
      )}
      {item.date && (
        <div className="mt-0.5 text-[10.5px] text-graphite-300">{item.date}</div>
      )}
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 flex items-center gap-1 text-[11px] text-graphite-300 hover:text-accent transition-colors"
        >
          <LinkIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{item.url}</span>
        </a>
      )}
    </div>
  );
}
