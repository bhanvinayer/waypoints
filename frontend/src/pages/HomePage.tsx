import { motion } from "framer-motion";
import { ArrowDown, FlaskConical, GitBranch, Map as MapIcon, RefreshCcw, ShieldCheck, Timer, Waypoints } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PlanForm, DEMO_REQUEST, useStartDiscovery } from "@/components/home/PlanForm";
import { HeroViz } from "@/components/home/HeroViz";
import { Button } from "@/components/ui/button";
import { nextSaturday } from "@/lib/time";

const PRINCIPLES = [
  { icon: Timer, title: "Temporal City Graph", body: "A place isn't good or bad — it's good at 4 PM and closed at 8 PM. Every experience is scored for the moment you'll be there." },
  { icon: MapIcon, title: "Route-aware discovery", body: "We search along the real corridor, not inside the destination. Things worth stopping for — not things to do in Jaipur." },
  { icon: Waypoints, title: "Experience windows", body: "Hours, events and golden hour become windows. A stop only makes your route if you can really experience it." },
  { icon: GitBranch, title: "Detour economics", body: "+12 min beats +2 km. Every stop shows what it costs in minutes, kilometres and rupees." },
  { icon: FlaskConical, title: "Plan stress test", body: "Delay it. Close a stop. Push the event. We re-run the whole temporal graph and show what breaks." },
  { icon: RefreshCcw, title: "Automatic recovery", body: "Broken stops are replaced by alternatives the backend has already validated — not by a chatbot's guess." },
  { icon: ShieldCheck, title: "Evidence-first AI", body: "SerpApi supplies the facts. Open-source LLMs on Groq only reason over them. Observed, inferred and simulated are never mixed." },
];

export default function HomePage() {
  const demo = useStartDiscovery();
  const runDemo = (survive: boolean) => {
    if (survive) sessionStorage.setItem("wp:autostress", "1");
    demo.mutate({ ...DEMO_REQUEST, date: nextSaturday() });
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <TopBar transparent />
      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full bg-accent/10 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -left-40 top-64 h-[420px] w-[420px] rounded-full bg-ok/10 blur-3xl" />
          <div className="relative mx-auto grid max-w-[1240px] gap-8 px-4 pb-14 pt-8 md:px-6 md:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-x-12 lg:gap-y-8">
            <div className="lg:col-start-1 lg:row-start-1">
              <div className="chip mb-5 !border-accent-100 !bg-accent-50 !text-accent-600">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> SerpApi India Hackathon · Travel &amp; Local Discovery
              </div>
              <h1 className="font-display text-[44px] font-extrabold leading-[0.98] tracking-tight sm:text-6xl lg:text-[68px]">
                Your route is more than a <span className="relative whitespace-nowrap text-accent">line on a map.<svg aria-hidden viewBox="0 0 300 12" className="absolute -bottom-2 left-0 h-3 w-full" preserveAspectRatio="none"><path d="M2 8 C 60 1, 120 12, 190 5 S 270 3, 298 7" stroke="#E8501C" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity=".45" /></svg></span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
                WAYPOINTS discovers experiences that actually fit your journey — based on where you'll be, when you'll arrive, what you love, and what happens if plans change.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button variant="accent" size="lg" onClick={() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                  Build my route <ArrowDown className="h-5 w-5" />
                </Button>
                <Button variant="outline" size="lg" onClick={() => runDemo(true)} disabled={demo.isPending}>
                  <FlaskConical className="h-5 w-5 text-accent" /> See how it survives a delay
                </Button>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold text-ink-500">
                {["Opening hours at arrival", "Detour cost in minutes", "Plan stress test", "Auto-recovery"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{t}</li>
                ))}
              </ul>
            </div>
            <div id="plan" className="scroll-mt-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <PlanForm />
            </div>
            <div className="lg:col-start-1 lg:row-start-2">
              <HeroViz />
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-white">
          <div className="mx-auto max-w-[1240px] px-4 py-14 md:px-6">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <div className="eyebrow mb-2">What makes it different</div>
                <h2 className="font-display text-3xl font-extrabold leading-tight md:text-4xl">Not a list of places.<br />A route that survives reality.</h2>
                <p className="mt-4 max-w-md text-ink-600">
                  Itinerary planners optimise <i>where</i> you go. WAYPOINTS optimises whether the experience will still work when you actually get there — and proves it by breaking your plan on purpose.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {PRINCIPLES.map((p, i) => (
                  <motion.div key={p.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: (i % 2) * 0.06 }}
                    className={`rounded-2xl border border-line bg-sand/60 p-4 ${i === PRINCIPLES.length - 1 ? "sm:col-span-2" : ""}`}>
                    <div className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-ink text-white"><p.icon className="h-4.5 w-4.5" /></div>
                    <h3 className="font-display text-base font-bold">{p.title}</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-ink-600">{p.body}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="mx-auto max-w-[1240px] px-4 py-10 text-sm text-ink-500 md:px-6">
          <div className="flex flex-col justify-between gap-3 md:flex-row">
            <span><b className="font-display tracking-wide text-ink">WAYPOINTS</b> — Temporal Route Intelligence. Search-powered travel intelligence on SerpApi.</span>
            <span>Reasoning by open-source models on Groq · Map © OpenStreetMap contributors, © CARTO</span>
          </div>
        </footer>
      </main>
    </motion.div>
  );
}
