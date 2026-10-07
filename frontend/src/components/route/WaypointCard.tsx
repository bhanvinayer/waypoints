import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight, Check, ChevronDown, Clock, FileSearch,
  Loader2, Plus, Replace, ShieldAlert, Star,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProvenanceChip, StatusChip } from "@/components/ui/chips";
import type { ExperienceNode, Waypoint } from "@/lib/types";
import { fmtClock, fmtDuration } from "@/lib/time";
import { cn, pct, roleLabel } from "@/lib/utils";

/* ── Score bar ──────────────────────────────────────────────────── */
export function FitBar({
  value,
  tone = "ok",
  className,
}: {
  value: number;
  tone?: "ok" | "warn" | "bad";
  className?: string;
}) {
  return (
    <div className={cn("h-0.5 overflow-hidden bg-graphite-500", className)}>
      <motion.div
        className={cn(
          "h-full",
          tone === "ok"   ? "bg-ok" :
          tone === "warn" ? "bg-warn" : "bg-bad"
        )}
        initial={{ width: 0 }}
        animate={{ width: `${Math.round(value * 100)}%` }}
        transition={{ type: "spring", stiffness: 100, damping: 22 }}
      />
    </div>
  );
}

/* ── Score bars breakdown ───────────────────────────────────────── */
const SCORE_ROWS: [keyof ExperienceNode["scores"], string][] = [
  ["preference_fit",   "Preference"],
  ["temporal_fit",     "Temporal"],
  ["route_fit",        "Route fit"],
  ["quality",          "Quality"],
  ["evidence",         "Evidence"],
  ["current_relevance","Relevance"],
];

export function ScoreBars({ node }: { node: ExperienceNode }) {
  return (
    <div className="space-y-2">
      {SCORE_ROWS.map(([k, label]) => {
        const v = node.scores[k] as number;
        const tone = v >= 0.7 ? "ok" : v >= 0.45 ? "warn" : "bad";
        return (
          <div key={k}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-[#4B5563] font-medium">{label}</span>
              <span className={cn(
                "tnum text-[11px] font-bold",
                tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-bad"
              )}>
                {pct(v)}
              </span>
            </div>
            <FitBar value={v} tone={tone} />
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t border-[#E4E2DC] pt-2">
        <span className="text-[11px] text-[#667085] font-medium">Total score</span>
        <span className="tnum text-[16px] font-bold text-[#151A23]">
          {Math.round(node.scores.total)}
          <span className="text-[10px] text-[#667085]">/100</span>
        </span>
      </div>
    </div>
  );
}

/* ── Why list ───────────────────────────────────────────────────── */
export function WhyList({ node }: { node: ExperienceNode }) {
  return (
    <ul className="space-y-1.5">
      {node.reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2">
          <Check className="h-3 w-3 text-ok mt-0.5 shrink-0" strokeWidth={3} />
          <span className="text-[12px] text-[#2D3440] font-medium leading-relaxed">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Main WaypointCard ──────────────────────────────────────────── */
interface WaypointCardProps {
  journeyId: string;
  node: ExperienceNode | Waypoint;
  index?: number;
  selected?: boolean;
  onSelect?: () => void;
  onEvidence?: () => void;
  onAdd?: () => void;
  onReplace?: () => void;
  adding?: boolean;
  replacing?: boolean;
  compact?: boolean;
  nameOf?: (id: string) => string | undefined;
}

export function WaypointCard({
  journeyId,
  node,
  index,
  selected,
  onSelect,
  onEvidence,
  onAdd,
  onReplace,
  adding,
  replacing,
  compact,
  nameOf,
}: WaypointCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isWp = "order" in node;
  const wp = isWp ? (node as Waypoint) : null;
  const t = node.temporal;
  const tone = t ? (!t.valid ? "red" : t.score >= 0.7 ? "green" : "yellow") : "gray";

  const toneColor =
    tone === "green"  ? "text-ok" :
    tone === "yellow" ? "text-warn" :
    tone === "red"    ? "text-bad" : "text-[#667085]";

  return (
    <motion.div
      id={`card-${node.id}`}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "border-b border-[#E4E2DC] last:border-0 transition-colors",
        selected ? "bg-[#FFF4EF] border-l-2 border-l-[#F45B22]" : "bg-white"
      )}
    >
      {/* ── Header row ──────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-start gap-3 px-3 py-3 cursor-pointer",
          onSelect && !selected && "hover:bg-[#FAFAF8] transition-colors",
          "group"
        )}
        onClick={onSelect}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onKeyDown={(e) => e.key === "Enter" && onSelect?.()}
      >
        {/* Thread node */}
        <div className="flex flex-col items-center shrink-0 mt-0.5">
          <div
            className={cn(
              "thread-node thread-node-lg",
              tone === "green"  ? "ok" :
              tone === "yellow" ? "warn" :
              tone === "red"    ? "bad" :
              selected          ? "active" : ""
            )}
          >
            {wp?.order ?? "·"}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name + status */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-[#667085] mb-0.5 uppercase tracking-wider font-bold">
                {roleLabel(node.role)}
              </div>
              <h3 className={cn(
                "text-[14px] font-bold leading-tight text-[#151A23] truncate",
                tone === "red" && "line-through decoration-bad/50"
              )}>
                {node.name}
              </h3>
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              <Link
                to={`/place/${node.id}?journey=${journeyId}`}
                className="text-[#667085] hover:text-[#151A23] transition-colors"
                onClick={(e) => e.stopPropagation()}
                aria-label="View place details"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Timing + detour */}
          {t && (
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <span className="tnum text-[11px] font-semibold text-[#151A23]">
                {fmtClock(t.arrival_min)} → {fmtClock(t.depart_min)}
              </span>
              <span className="tnum text-[10px] text-[#4B5563] font-medium">
                +{Math.round(node.route_detour_minutes)} min detour
              </span>
              {t.status && (
                <StatusChip status={t.status} tone={tone as any} compact />
              )}
            </div>
          )}

          {/* Score bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9.5px] text-[#667085] uppercase tracking-wider font-bold">
                Match
              </span>
              <span className={cn("tnum text-[11px] font-bold", toneColor)}>
                {Math.round(node.scores.total)}/100
              </span>
            </div>
            <FitBar
              value={node.scores.total / 100}
              tone={tone === "green" ? "ok" : tone === "yellow" ? "warn" : tone === "red" ? "bad" : "ok"}
            />
          </div>
        </div>
      </div>

      {/* ── Expanded detail ─────────────────────────────────── */}
      {selected && !compact && (
        <div className="px-3 pb-3 border-t border-[#E4E2DC]">
          {/* Brief detail section */}
          {node.description && (
            <p className="mt-2.5 text-[12px] text-[#2D3440] font-medium leading-relaxed">
              {node.description}
            </p>
          )}

          {/* Rating */}
          {node.rating != null && (
            <div className="mt-2 flex items-center gap-1.5">
              <Star className="h-3 w-3 fill-warn text-warn" />
              <span className="tnum text-[11px] font-bold text-[#151A23]">{node.rating.toFixed(1)}</span>
              {node.review_count && (
                <span className="text-[10px] text-[#667085]">
                  ({node.review_count.toLocaleString()})
                </span>
              )}
            </div>
          )}

          {/* Score breakdown toggle */}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-2.5 flex items-center gap-1 text-[11px] text-[#667085] hover:text-[#151A23] font-medium transition-colors cursor-pointer"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide" : "Score breakdown"}
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden mt-2"
              >
                <ScoreBars node={node} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {onEvidence && (
              <Button size="sm" variant="outline" onClick={onEvidence}>
                <FileSearch className="h-3 w-3" />
                Evidence
              </Button>
            )}
            {onReplace && (
              <Button
                size="sm"
                variant="outline"
                onClick={onReplace}
                disabled={replacing}
              >
                {replacing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Replace className="h-3 w-3" />
                )}
                Replace
              </Button>
            )}
            {onAdd && (
              <Button
                size="sm"
                variant="accent"
                onClick={onAdd}
                disabled={adding}
              >
                {adding ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Add to route
              </Button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
