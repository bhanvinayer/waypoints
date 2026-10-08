/**
 * WaypointsRouteTimeline
 *
 * Vertical "Route Computation Timeline" for the DiscoverPage.
 *
 * LAYOUT
 * ──────
 * A centred, single-column vertical timeline.  Each milestone has:
 *   • A rounded-square green check badge (48 × 48 px, border-radius 12 px) on
 *     the left rail.
 *   • A thin vertical connector line below each badge (except the last).
 *   • Title, description, and elapsed time to the right of the badge.
 *
 * The layout is identical on desktop and mobile; mobile reduces spacing and
 * type sizes.
 *
 * STATE
 * ─────
 * Accepts StageInfo[] from the existing job-polling query.
 * pending  → muted neutral badge
 * running  → green badge with spinner + "Calculating" copy
 * done     → solid green badge with white check
 * skipped  → solid green badge with skip icon
 * error    → red badge with warning icon
 *
 * ANIMATION
 * ─────────
 * Each milestone entrance: fade + subtle upward slide via Framer Motion.
 * Connecting line: fills green as the stage above it completes.
 * Badge: scale spring on state change.
 * Respects prefers-reduced-motion — all motion is disabled when set.
 *
 * No horizontal scrolling. No sticky pinning. No horizontal overflow.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, SkipForward, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageInfo } from "@/lib/types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RouteTimelineProps {
  /** Live stage data from the job-polling query. undefined → skeletons. */
  stages?: StageInfo[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Stage short labels (eyebrow above the title)
// ---------------------------------------------------------------------------

const STAGE_SHORT: Record<string, string> = {
  understanding: "UNDERSTAND",
  mapping: "ROUTE",
  finding: "DISCOVER",
  opening_windows: "HOURS",
  events: "EVENTS",
  signals: "SIGNALS",
  feasibility: "FEASIBILITY",
  stress: "STRESS TEST",
};

function shortLabel(key: string): string {
  if (STAGE_SHORT[key]) return STAGE_SHORT[key];
  for (const [k, v] of Object.entries(STAGE_SHORT)) {
    if (key.startsWith(k)) return v;
  }
  return key.toUpperCase().slice(0, 11);
}

// ---------------------------------------------------------------------------
// Variant helpers
// ---------------------------------------------------------------------------

type NodeVariant = "pending" | "running" | "done" | "skipped" | "error";

function getVariant(s: StageInfo): NodeVariant {
  if (s.status === "done") return "done";
  if (s.status === "skipped") return "skipped";
  if (s.status === "running") return "running";
  if (s.status === "error") return "error";
  return "pending";
}

// ---------------------------------------------------------------------------
// Rounded-square check badge
// ---------------------------------------------------------------------------

interface BadgeProps {
  variant: NodeVariant;
  /** Whether this is the currently active (running) milestone */
  isActive: boolean;
}

function CheckBadge({ variant, isActive }: BadgeProps) {
  const isCompleted = variant === "done" || variant === "skipped";
  const isError = variant === "error";
  const isPending = variant === "pending";

  return (
    <motion.div
      initial={false}
      animate={{
        scale: isActive ? 1.08 : 1,
        opacity: isPending ? 0.38 : 1,
      }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={cn(
        // Rounded-square: 48 × 48, radius 12
        "grid h-12 w-12 shrink-0 place-items-center rounded-[12px] transition-colors duration-300",
        // Completed / skipped — solid WAYPOINTS green
        isCompleted && "bg-ok text-white",
        // Running — green tint border
        isActive && !isCompleted && !isError &&
          "border-2 border-ok bg-ok/10 text-ok",
        // Error
        isError && "bg-bad text-white",
        // Pending
        isPending && "border-2 border-line bg-white text-ink-300",
        // Subtle halo on completed
        isCompleted && "shadow-[0_0_0_4px_rgba(30,158,106,0.12)]",
      )}
      aria-hidden
    >
      {isCompleted ? (
        // White check — Lucide Check, strokeWidth 2.5 for clean appearance
        variant === "skipped" ? (
          <SkipForward className="h-[18px] w-[18px]" strokeWidth={2.5} />
        ) : (
          <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
        )
      ) : isActive ? (
        <Loader2 className="h-[18px] w-[18px] animate-spin" />
      ) : isError ? (
        <TriangleAlert className="h-[18px] w-[18px]" />
      ) : (
        // Pending — small neutral dot
        <span className="block h-2 w-2 rounded-full bg-ink-300" />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Vertical connector line between badges
// ---------------------------------------------------------------------------

interface ConnectorProps {
  /** Whether the stage above this line is completed */
  filled: boolean;
}

function Connector({ filled }: ConnectorProps) {
  return (
    // 2 px wide, 32 px tall (adjustable via the wrapper height).
    // The green fill animates from 0 → 100% height.
    <div className="relative mx-auto w-[2px]" style={{ height: 36 }} aria-hidden>
      {/* Track */}
      <div className="absolute inset-0 rounded-full bg-line" />
      {/* Fill */}
      <motion.div
        className="absolute inset-x-0 top-0 rounded-full bg-ok"
        initial={false}
        animate={{ height: filled ? "100%" : "0%" }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single milestone row
// ---------------------------------------------------------------------------

interface MilestoneRowProps {
  stage: StageInfo;
  index: number;
  total: number;
  isActive: boolean;
  prefersReduced: boolean;
}

function MilestoneRow({
  stage,
  index,
  total,
  isActive,
  prefersReduced,
}: MilestoneRowProps) {
  const variant = getVariant(stage);
  const isCompleted = variant === "done" || variant === "skipped";
  const isError = variant === "error";
  const isPending = variant === "pending";

  // Entrance animation: only animate if motion is allowed
  const entrance = prefersReduced
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: {
          delay: index * 0.06,
          duration: 0.4,
          ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
        },
      };

  return (
    <li>
      {/* ── Rail + content row ── */}
      <motion.div className="flex items-start gap-5" {...entrance}>
        {/* Left rail: badge only (connector rendered separately below) */}
        <div className="flex flex-col items-center">
          <CheckBadge variant={variant} isActive={isActive} />
        </div>

        {/* Right: content */}
        <div className="min-w-0 flex-1 pb-1 pt-1">
          {/* Eyebrow */}
          <div
            className="eyebrow mb-0.5 !tracking-[0.14em]"
            style={{
              color: isActive
                ? "#1E9E6A"
                : isCompleted
                  ? "#3B5750"
                  : "#8A9B96",
            }}
          >
            {shortLabel(stage.key)}
          </div>

          {/* Title */}
          <p
            className={cn(
              "font-display text-[15px] font-bold leading-snug",
              isPending ? "text-ink-300" : isError ? "text-bad" : "text-ink",
            )}
          >
            {stage.label}
          </p>

          {/* Detail / description */}
          <AnimatePresence>
            {stage.detail && (
              <motion.p
                key="detail"
                initial={prefersReduced ? {} : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={cn(
                  "mt-1 overflow-hidden text-[13px] leading-relaxed",
                  isError ? "text-bad" : isPending ? "text-ink-300" : "text-ink-500",
                )}
              >
                {stage.detail}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Footer row: elapsed time + running badge */}
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {stage.duration_ms != null && isCompleted && (
              <span className="tnum text-[11px] font-semibold text-ink-400">
                {(stage.duration_ms / 1000).toFixed(1)}s
              </span>
            )}
            {isActive && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ok">
                <span className="inline-block h-1.5 w-1.5 animate-[floaty_2.4s_ease-in-out_infinite] rounded-full bg-ok" />
                Calculating
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Vertical connector below this milestone (except last) ── */}
      {index < total - 1 && (
        <div className="ml-[23px]">
          {/* 23px = half badge width (24px) – 1px to centre on the badge */}
          <Connector filled={isCompleted} />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Skeleton placeholders
// ---------------------------------------------------------------------------

function TimelineSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-start gap-5">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-[12px] bg-sand-200" />
          <div className="flex-1 space-y-2 pt-1">
            <div
              className="h-2 animate-pulse rounded-full bg-sand-200"
              style={{ width: `${40 + (i % 3) * 15}%` }}
            />
            <div
              className="h-3 animate-pulse rounded-full bg-sand-200"
              style={{ width: `${55 + (i % 2) * 20}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WaypointsRouteTimeline({
  stages,
  className,
}: RouteTimelineProps) {
  const prefersReduced = useReducedMotion() ?? false;

  // Active milestone index — driven by live job state.
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!stages) return;
    const runningIdx = stages.findIndex((s) => s.status === "running");
    const lastDone = stages.reduce<number>(
      (acc, s, i) =>
        s.status === "done" || s.status === "skipped" ? i : acc,
      -1,
    );
    const live =
      runningIdx >= 0 ? runningIdx : lastDone >= 0 ? lastDone : 0;
    setActiveIndex((prev) => Math.max(prev, live));
  }, [stages]);

  const allComplete =
    stages !== undefined &&
    stages.every((s) => s.status === "done" || s.status === "skipped");

  // ── Header ──
  const doneCount =
    stages?.filter((s) => s.status === "done" || s.status === "skipped")
      .length ?? 0;
  const totalCount = stages?.length ?? 8;

  return (
    <div
      className={cn(
        // Centred narrow column — comfortable reading width on all viewports.
        // max-w-xl keeps it from stretching across a wide desktop.
        "mx-auto w-full max-w-xl px-4 pb-14 pt-10 sm:px-6",
        className,
      )}
    >
      {/* ── Section header ── */}
      <div className="mb-10 text-center">
        <div className="eyebrow mb-1.5 !tracking-[0.16em]">
          Route Computation
        </div>
        <h2 className="font-display text-[28px] font-extrabold leading-[1.08] tracking-tight sm:text-[32px]">
          Building a route that&nbsp;survives&nbsp;reality.
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink-600">
          WAYPOINTS validates every stop against time, distance, availability
          and live signals before the route is considered viable.
        </p>

        {/* Thin progress bar */}
        {stages && (
          <div className="mx-auto mt-5 h-[2px] max-w-xs overflow-hidden rounded-full bg-sand-200">
            <motion.div
              className="h-full rounded-full bg-ok"
              initial={false}
              animate={{
                width: `${(doneCount / totalCount) * 100}%`,
              }}
              transition={
                prefersReduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 80, damping: 18 }
              }
            />
          </div>
        )}

        {/* Step counter */}
        {stages && (
          <p className="tnum mt-2 text-[12px] font-semibold text-ink-400">
            {doneCount}
            <span className="text-ink-300">/{totalCount}</span> steps verified
          </p>
        )}
      </div>

      {/* ── Milestone list ── */}
      {stages ? (
        <ol className="list-none space-y-0">
          {stages.map((s, i) => (
            <MilestoneRow
              key={s.key}
              stage={s}
              index={i}
              total={stages.length}
              isActive={i === activeIndex && s.status === "running"}
              prefersReduced={prefersReduced}
            />
          ))}

          {/* ── Terminal "Route Ready" item ── */}
          <AnimatePresence>
            {allComplete && (
              <motion.li
                key="route-ready"
                initial={prefersReduced ? {} : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Connector above */}
                <div className="ml-[23px]">
                  <Connector filled />
                </div>

                <div className="flex items-start gap-5">
                  {/* Terminal badge — slightly larger ring */}
                  <div
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-ok text-white"
                    style={{ boxShadow: "0 0 0 5px rgba(30,158,106,0.16)" }}
                  >
                    <Check className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
                  </div>
                  <div className="pt-1">
                    <div className="eyebrow mb-0.5 !text-ok !tracking-[0.14em]">
                      ROUTE READY
                    </div>
                    <p className="font-display text-[15px] font-bold text-ink">
                      Your living route is ready.
                    </p>
                  </div>
                </div>
              </motion.li>
            )}
          </AnimatePresence>
        </ol>
      ) : (
        <TimelineSkeleton />
      )}
    </div>
  );
}
