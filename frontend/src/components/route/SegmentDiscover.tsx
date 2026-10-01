import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Compass, Loader2, Star } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { ExperienceNode, JourneyResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { WaypointCard } from "./WaypointCard";
import { cn } from "@/lib/utils";

interface Props {
  journey: JourneyResponse;
  onCandidates: (nodes: ExperienceNode[]) => void;
  onEvidence: (n: ExperienceNode) => void;
  onAdd: (id: string) => void;
  addingId?: string | null;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

export function SegmentDiscover({ journey, onCandidates, onEvidence, onAdd, addingId, onSelect, selectedId }: Props) {
  const segments = useMemo(() => {
    const towns = journey.route.corridor;
    const marks = [{ name: journey.origin.name.split(",")[0], p: 0 }, ...towns.map((t) => ({ name: t.name, p: t.progress })), { name: journey.destination.name.split(",")[0], p: 1 }];
    if (marks.length <= 3) {
      return [0, 1, 2, 3].map((i) => ({ label: `${i * 25}–${(i + 1) * 25}%`, from: i / 4, to: (i + 1) / 4 }));
    }
    return marks.slice(0, -1).map((m, i) => ({ label: `${m.name} → ${marks[i + 1].name}`, from: m.p, to: marks[i + 1].p }));
  }, [journey]);
  const [idx, setIdx] = useState(Math.min(1, segments.length - 1));
  const seg = segments[idx];

  const run = useMutation({
    mutationFn: () => api.segment(journey.journey_id, seg.from, seg.to, 5),
    onSuccess: (r) => onCandidates(r.candidates),
  });
  const err = run.error as ApiError | null;

  return (
    <div>
      <div className="relative mb-3 rounded-2xl bg-white p-3.5 border border-line">
        <div className="relative mx-1 h-12">
          <div className="absolute left-0 right-0 top-6 h-[3px] rounded-full bg-sand-300" />
          {segments.map((s, i) => (
            <button
              key={i}
              onClick={() => { setIdx(i); run.reset(); onCandidates([]); }}
              aria-label={`Segment ${s.label}`}
              aria-pressed={i === idx}
              className={cn("absolute top-[18px] h-[18px] rounded-full transition-all", i === idx ? "bg-accent shadow-glow" : "bg-ink-300 hover:bg-ink-400")}
              style={{ left: `${s.from * 100}%`, width: `${Math.max(2, (s.to - s.from) * 100)}%`, opacity: i === idx ? 1 : 0.55 }}
            />
          ))}
          {[...journey.route.corridor].map((t) => (
            <span key={t.name} className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9.5px] font-semibold uppercase tracking-wide text-ink-400" style={{ left: `${t.progress * 100}%` }}>{t.name.slice(0, 9)}</span>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] font-bold">
          <span>{journey.origin.name.split(",")[0]}</span>
          <span>{journey.destination.name.split(",")[0]}</span>
        </div>
      </div>
      <p className="mb-3 text-[13px] text-ink-600">Selected segment: <b>{seg.label}</b></p>
      <Button variant="soft" className="w-full" onClick={() => run.mutate()} disabled={run.isPending}>
        {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />} Show me 5 interesting things along this segment
      </Button>
      {err && <p role="alert" className="mt-3 rounded-xl bg-bad-50 p-3 text-[13px] text-bad">{err.message} {err.retriable && <button className="font-bold underline" onClick={() => run.mutate()}>Retry</button>}</p>}
      {run.data && (
        <div className="mt-4 space-y-3">
          <p className="text-[12.5px] font-semibold text-ink-600">{run.data.note ?? (run.data.candidates.length ? "" : "Nothing new found along this segment.")}</p>
          {run.data.candidates.map((c: ExperienceNode, i: number) => (
            <WaypointCard journeyId={journey.journey_id} key={c.id} node={c} index={i} compact selected={selectedId === c.id} onSelect={() => onSelect(c.id)} onEvidence={() => onEvidence(c)} onAdd={() => onAdd(c.id)} adding={addingId === c.id} />
          ))}
        </div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-500"><Star className="h-3 w-3" /> Fresh Google Maps searches for just this corridor, validated against your current plan.</p>
    </div>
  );
}
