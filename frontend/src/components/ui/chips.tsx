import { cn } from "@/lib/utils";
import type { TemporalStatus, Tone } from "@/lib/types";

/** Data mode badge — LIVE or DEMO */
export function DataBadge({ mode }: { mode?: "live" | "demo" }) {
  if (!mode) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em]",
        "px-2 py-1 border",
        mode === "live"
          ? "border-ok/30 bg-[rgba(34,197,94,0.08)] text-ok"
          : "border-warn/30 bg-[rgba(234,179,8,0.08)] text-warn"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", mode === "live" ? "bg-ok" : "bg-warn")} />
      {mode === "live" ? "Live Data" : "Demo Snapshot"}
    </span>
  );
}

/** Provenance chip — OBSERVED / INFERRED / SIMULATED / USER */
export function ProvenanceChip({
  provenance,
  compact,
}: {
  provenance?: string;
  compact?: boolean;
}) {
  if (!provenance) return null;

  const classes: Record<string, string> = {
    observed: "badge-observed",
    inferred: "badge-inferred",
    simulated: "badge-simulated",
    user: "badge-user",
  };

  return (
    <span className={classes[provenance] ?? "badge-user"}>
      {provenance}
    </span>
  );
}

const STATUS_MAP: Record<
  TemporalStatus,
  { dot: string; text: string; label: string }
> = {
  IDEAL_WINDOW:     { dot: "ideal",   text: "text-ok",      label: "Ideal Window" },
  OPEN_AT_ARRIVAL:  { dot: "open",    text: "text-ok",      label: "Open" },
  CLOSING_TOO_SOON: { dot: "closing", text: "text-warn",    label: "Closing Soon" },
  NOT_OPEN:         { dot: "closed",  text: "text-bad",     label: "Closed" },
  EVENT_CONFLICT:   { dot: "conflict",text: "text-accent",  label: "Conflict" },
  WINDOW_MISSED:    { dot: "closed",  text: "text-bad",     label: "Missed" },
  UNKNOWN_HOURS:    { dot: "unknown", text: "text-graphite-200", label: "Hours Unknown" },
};

/** Status chip — compact temporal state indicator */
export function StatusChip({
  status,
  tone,
  compact,
}: {
  status: TemporalStatus;
  tone?: Tone;
  compact?: boolean;
}) {
  const s = STATUS_MAP[status] ?? { dot: "unknown", text: "text-graphite-200", label: status };
  return (
    <span className={cn("inline-flex items-center gap-1.5", s.text)}>
      <span className={`status-dot ${s.dot}`} />
      <span className={cn("font-semibold", compact ? "text-[10px]" : "text-[11px]")}>
        {s.label}
      </span>
    </span>
  );
}

/** Tone indicator dot */
export function ToneDot({ tone }: { tone: Tone }) {
  return (
    <span
      className={cn(
        "status-dot",
        tone === "green"  && "ideal",
        tone === "yellow" && "closing",
        tone === "red"    && "closed",
        tone === "gray"   && "unknown"
      )}
    />
  );
}
