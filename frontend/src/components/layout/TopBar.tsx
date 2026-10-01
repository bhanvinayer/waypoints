import { Link, useLocation } from "react-router-dom";
import { Activity, FlaskConical } from "lucide-react";
import { Wordmark } from "@/components/ui/logo";
import { DataBadge } from "@/components/ui/chips";
import { Button } from "@/components/ui/button";
import type { DataMode } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  mode?: DataMode;
  since?: string;
  onOpenTrace?: () => void;
  journeyId?: string;
  transparent?: boolean;
}

export function TopBar({ mode, since, onOpenTrace, journeyId, transparent }: Props) {
  const { pathname } = useLocation();
  const onStress = pathname.endsWith("/stress-test");
  return (
    <header className={cn("sticky top-0 z-[900] border-b backdrop-blur-xl", transparent ? "border-transparent bg-sand/60" : "border-line bg-sand/90")}>
      <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-3 px-4 md:px-6">
        <Link to="/" aria-label="WAYPOINTS home" className="shrink-0">
          <Wordmark />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          {mode && <DataBadge mode={mode} since={since} onClick={onOpenTrace} className="truncate" />}
          {onOpenTrace && (
            <Button variant="outline" size="sm" onClick={onOpenTrace} className="hidden md:inline-flex">
              <Activity className="h-3.5 w-3.5" /> Live search trace
            </Button>
          )}
          {journeyId && (
            <Button asChild variant={onStress ? "outline" : "accent"} size="sm">
              {onStress ? (
                <Link to={`/route/${journeyId}`}>Back to route</Link>
              ) : (
                <Link to={`/route/${journeyId}/stress-test`}>
                  <FlaskConical className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Stress test</span>
                  <span className="sm:hidden">What if?</span>
                </Link>
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
