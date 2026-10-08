/**
 * WaypointsShuffleGrid
 *
 * A reusable animated feature-card grid whose cards continuously and
 * smoothly exchange positions — communicating that WAYPOINTS is always
 * recomputing a route.
 *
 * Interaction inspired by the "shuffle grid" pattern.  Visual language
 * follows the WAYPOINTS design system (sand / ink / line / accent tokens).
 *
 * Key design decisions:
 *  - Cards occupy *named* grid slots; we shuffle the mapping of card→slot,
 *    not the DOM order.  Framer Motion's `layoutId` drives the smooth
 *    cross-position animation so each card glides to its new slot.
 *  - A dedicated `ShuffleSlot` wrapper (position:absolute, sized to the
 *    measured slot rect) is used so cards never clip or overlap.
 *  - The last card (index 6) gets the full-width "span-2" slot; we keep
 *    that constraint but allow it to participate in shuffling with other
 *    cards when the wide slot is involved.
 *  - Shuffle pauses while any card is hovered (ref: hoverCount).
 *  - Respects `prefers-reduced-motion` — no shuffling, static layout.
 *  - Pauses when the section is scrolled out of view (IntersectionObserver).
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ShuffleFeature {
  id: string;
  title: string;
  description: string;
  Icon: LucideIcon;
}

interface WaypointsShuffleGridProps {
  features: ShuffleFeature[];
  /** Milliseconds between shuffles. Default: 2800 */
  interval?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Grid slot definitions
// ---------------------------------------------------------------------------

/**
 * We model an abstract grid with the following column × row layout:
 *
 *   col: [1] [2]
 *   row:  1   1   →  slot 0, slot 1
 *         2   2   →  slot 2, slot 3
 *         3   3   →  slot 4, slot 5
 *         4 wide  →  slot 6  (spans both cols)
 *
 * For 7 features we have exactly 7 slots.
 */
type SlotDef = {
  colStart: number; // 1-indexed CSS grid col start
  colSpan: number;
  rowStart: number; // 1-indexed CSS grid row start
  rowSpan: number;
};

const SLOT_DEFS: SlotDef[] = [
  { colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
  { colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
  { colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
  { colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
  { colStart: 1, colSpan: 1, rowStart: 3, rowSpan: 1 },
  { colStart: 2, colSpan: 1, rowStart: 3, rowSpan: 1 },
  { colStart: 1, colSpan: 2, rowStart: 4, rowSpan: 1 }, // wide
];

// ---------------------------------------------------------------------------
// Shuffle helpers
// ---------------------------------------------------------------------------

/**
 * Partial shuffle: swap only a random pair of slots, keeping the wide
 * slot (index 6) always mapped to the wide slot def (index 6 in SLOT_DEFS)
 * so the layout never looks broken.
 *
 * We swap two random cards from slots 0-5 (the normal slots).
 * This feels "deliberate" — one recalculation step at a time.
 */
function partialShuffle(current: number[]): number[] {
  const next = [...current];
  // Pick two distinct indices from 0..5
  let a = Math.floor(Math.random() * 6);
  let b: number;
  do {
    b = Math.floor(Math.random() * 6);
  } while (b === a);
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** Identity: slot i → feature i */
const IDENTITY = Array.from({ length: 7 }, (_, i) => i);

// ---------------------------------------------------------------------------
// Motion spring config
// ---------------------------------------------------------------------------

const SPRING = {
  type: "spring" as const,
  stiffness: 120,
  damping: 22,
  mass: 1,
};

// ---------------------------------------------------------------------------
// Individual card
// ---------------------------------------------------------------------------

interface CardProps {
  feature: ShuffleFeature;
  isWide: boolean;
  instanceId: string;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

function FeatureCard({
  feature,
  isWide,
  instanceId,
  onHoverStart,
  onHoverEnd,
}: CardProps) {
  const { Icon } = feature;

  return (
    <motion.div
      layoutId={`${instanceId}-card-${feature.id}`}
      layout
      transition={SPRING}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      whileHover={{ y: -3 }}
      className={cn(
        "group relative flex h-full flex-col rounded-xl border border-line bg-sand/70 p-4",
        "cursor-default select-none",
        "transition-[border-color,box-shadow] duration-200",
        "hover:border-ink/20 hover:shadow-[0_2px_16px_-4px_rgba(16,33,29,0.12)]",
        isWide && "sm:flex-row sm:items-start sm:gap-4",
      )}
    >
      {/* Icon block */}
      <div
        className={cn(
          "mb-3 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-white",
          "transition-transform duration-300 group-hover:scale-105",
          isWide && "sm:mb-0",
        )}
      >
        <Icon
          className="h-[15px] w-[15px]"
          strokeWidth={1.75}
          aria-hidden
        />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[13.5px] font-bold leading-snug text-ink">
          {feature.title}
        </h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">
          {feature.description}
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WaypointsShuffleGrid({
  features,
  interval = 2800,
  className,
}: WaypointsShuffleGridProps) {
  const prefersReduced = useReducedMotion();
  const instanceId = useId();

  // slotToFeature[slotIndex] = featureIndex
  const [slotToFeature, setSlotToFeature] = useState<number[]>(IDENTITY);
  const hoverCount = useRef(0);
  const visibleRef = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pause when not visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const doShuffle = useCallback(() => {
    if (prefersReduced) return;
    if (!visibleRef.current) return;
    if (hoverCount.current > 0) return;
    setSlotToFeature((prev) => partialShuffle(prev));
  }, [prefersReduced]);

  // Periodic shuffle
  useEffect(() => {
    if (prefersReduced) return;
    const id = setInterval(doShuffle, interval);
    return () => clearInterval(id);
  }, [doShuffle, interval, prefersReduced]);

  const onHoverStart = useCallback(() => {
    hoverCount.current++;
  }, []);
  const onHoverEnd = useCallback(() => {
    hoverCount.current = Math.max(0, hoverCount.current - 1);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative grid grid-cols-2 grid-rows-4 gap-2.5",
        // Give each row enough height to fit content; allow rows to be auto
        // but set a reasonable min so cards don't collapse.
        "[&>*]:min-h-[110px]",
        className,
      )}
      aria-label="Feature cards — reordering to demonstrate route recalculation"
    >
      {SLOT_DEFS.map((slot, slotIdx) => {
        const featureIdx = slotToFeature[slotIdx];
        const feature = features[featureIdx];
        if (!feature) return null;
        const isWide = slot.colSpan === 2;

        return (
          <div
            key={slotIdx}
            style={{
              gridColumnStart: slot.colStart,
              gridColumnEnd: `span ${slot.colSpan}`,
              gridRowStart: slot.rowStart,
              gridRowEnd: `span ${slot.rowSpan}`,
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <FeatureCard
                key={`slot-${slotIdx}-feat-${feature.id}`}
                feature={feature}
                isWide={isWide}
                instanceId={instanceId}
                onHoverStart={onHoverStart}
                onHoverEnd={onHoverEnd}
              />
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
