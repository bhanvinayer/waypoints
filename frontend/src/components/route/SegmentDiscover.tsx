import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { ExperienceNode, JourneyResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  journey: JourneyResponse;
  onCandidates: (nodes: ExperienceNode[]) => void;
  onEvidence: (node: ExperienceNode) => void;
  onAdd: (id: string) => void;
  addingId: string | null;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

export function SegmentDiscover({ journey, onCandidates, onEvidence, onAdd, addingId, onSelect, selectedId }: Props) {
  const [segIdx, setSegIdx] = useState(0);

  const segments = journey.route.corridor.length > 1
    ? journey.route.corridor.slice(0, -1).map((t, i) => ({
        label: `${t.name.split(",")[0]} → ${journey.route.corridor[i + 1].name.split(",")[0]}`,
        from: t,
        to: journey.route.corridor[i + 1],
      }))
    : [];

  const discover = useMutation({
    mutationFn: () => {
      const seg = segments[segIdx];
      if (!seg) throw new Error("No segment");
      return api.segment(
        journey.journey_id,
        seg.from.progress,
        seg.to.progress,
        5,
      );
    },
    onSuccess: (data) => onCandidates(data.candidates),
  });

  const err = discover.error as ApiError | null;

  if (segments.length === 0) return null;

  return (
    <div className="border border-[#2A2A2A]">
      <div className="eyebrow px-3 py-2 border-b border-[#1E1E1E]">ROUTE-AWARE SEARCH</div>
      <div className="p-3">
        {/* Segment picker */}
        <div className="flex flex-wrap gap-1 mb-3">
          {segments.slice(0, 4).map((seg, i) => (
            <button
              key={i}
              onClick={() => setSegIdx(i)}
              className={cn(
                "chip text-[10px]",
                segIdx === i && "active"
              )}
            >
              {seg.label}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => discover.mutate()}
          disabled={discover.isPending}
        >
          {discover.isPending ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Searching corridor…</>
          ) : (
            "Search this segment"
          )}
        </Button>

        {err && (
          <p className="mt-2 text-[11px] text-bad">{err.message}</p>
        )}
      </div>
    </div>
  );
}
