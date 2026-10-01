import { Eye, FlaskConical, Calculator, User, Radio, Database } from "lucide-react";
import type { DataMode, Provenance, TemporalStatus, Tone } from "@/lib/types";
import { cn, STATUS_LABEL, TONE_STYLE } from "@/lib/utils";

const PROV: Record<Provenance, { label: string; icon: typeof Eye; cls: string; hint: string }> = {
  observed: { label: "Observed", icon: Eye, cls: "bg-ok-50 text-ok border-ok-100", hint: "Returned by a SerpApi engine" },
  inferred: { label: "Inferred", icon: Calculator, cls: "bg-sand-100 text-ink-600 border-line", hint: "Deterministic arithmetic over observed data" },
  simulated: { label: "Simulated", icon: FlaskConical, cls: "bg-accent-50 text-accent-600 border-accent-100", hint: "A what-if scenario, not a prediction" },
  user: { label: "You said", icon: User, cls: "bg-white text-ink-600 border-line", hint: "Provided by you" },
};

export function ProvenanceChip({ provenance, className, compact }: { provenance: Provenance; className?: string; compact?: boolean }) {
  const p = PROV[provenance];
  const Icon = p.icon;
  return (
    <span title={p.hint} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", p.cls, className)}>
      <Icon className="h-3 w-3" />
      {!compact && p.label}
    </span>
  );
}

export function StatusChip({ status, tone, className }: { status: TemporalStatus; tone: Tone; className?: string }) {
  const t = TONE_STYLE[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", t.bg, t.border, t.text, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function DataBadge({ mode, className, onClick, since }: { mode: DataMode; className?: string; onClick?: () => void; since?: string }) {
  const live = mode === "live";
  const Comp: any = onClick ? "button" : "span";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition",
        live ? "border-ok-100 bg-ok-50 text-ok" : "border-warn-100 bg-warn-50 text-[#8a6100]",
        onClick && "hover:brightness-95",
        className,
      )}
      title={live ? "Every fact on this page came from a live SerpApi call" : "Sample data in SerpApi's response shape — not live"}
    >
      {live ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
          </span>
          Live search
          {since && <span className="hidden font-medium normal-case tracking-normal opacity-70 sm:inline">· checked {since}</span>}
        </>
      ) : (
        <>
          <Database className="h-3.5 w-3.5" />
          Demo snapshot
          <span className="hidden font-medium normal-case tracking-normal opacity-70 sm:inline">· sample data</span>
        </>
      )}
    </Comp>
  );
}

export function LiveDot() {
  return <Radio className="h-3.5 w-3.5" />;
}
