import { Link } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";

export default function NotFound({ message }: { message?: string }) {
  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto grid max-w-xl place-items-center px-4 py-24 text-center">
        <div className="eyebrow mb-2">Off the route</div>
        <h1 className="font-display text-5xl font-extrabold">Nothing here.</h1>
        <p className="mt-3 text-ink-600">{message ?? "That page isn't on any route we know."}</p>
        <Button asChild variant="accent" className="mt-6"><Link to="/">Plan a journey</Link></Button>
      </main>
    </div>
  );
}
