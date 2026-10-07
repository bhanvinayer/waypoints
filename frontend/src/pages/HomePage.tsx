import { useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Clock, Map, Search, Star, Zap, RefreshCw, ChevronRight, Locate, X, ArrowRight, Layers, CheckCircle2
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { RouteCommandBar, DemoButton } from "@/components/home/PlanForm";
import { MAP_STYLES, DEFAULT_MAP_STYLE, getSafeMapStyle, type MapStyleKey } from "@/lib/map-styles";
import { MapStyleSelector } from "@/components/route/MapControls";
import { cn } from "@/lib/utils";

// Demo corridor coordinates (Delhi → Neemrana → Alwar → Jaipur)
const DEMO_ROUTE_POINTS: [number, number][] = [
  [28.6139, 77.2090], // Delhi
  [28.3800, 76.9200], // Manesar
  [28.0800, 76.7500], // Dharuhera
  [27.9892, 76.3869], // Neemrana
  [27.8000, 76.4500], // Kotputli
  [27.5530, 76.6346], // Alwar
  [27.1500, 76.0000], // Shahpura
  [26.9124, 75.7873], // Jaipur
];

// Waypoint markers for demo map
const DEMO_WAYPOINTS = [
  { id: "delhi", name: "Delhi", pos: [28.6139, 77.2090] as [number, number], type: "start" },
  { id: "neemrana", name: "Neemrana", pos: [27.9892, 76.3869] as [number, number], type: "wp", order: 1 },
  { id: "alwar", name: "Alwar", pos: [27.5530, 76.6346] as [number, number], type: "wp", order: 2 },
  { id: "jaipur", name: "Jaipur", pos: [26.9124, 75.7873] as [number, number], type: "end" },
];

function originPinIcon(label: string) {
  return L.divIcon({
    className: "wp-origin-pin",
    iconSize: [80, 32],
    iconAnchor: [16, 16],
    html: `<div style="display:flex; align-items:center; gap:6px; background:#FFFFFF; border:1px solid #E4E2DC; padding:3px 8px; border-radius:14px; shadow:0 2px 8px rgba(0,0,0,0.1); font-family:Inter,sans-serif;">
      <div style="width:12px; height:12px; border-radius:50%; background:#F45B22; border:2px solid #FFFFFF; box-shadow:0 0 0 2px #F45B22;"></div>
      <span style="font-size:11px; font-weight:700; color:#151A23;">${label}</span>
    </div>`,
  });
}

function waypointPinIcon(label: string) {
  return L.divIcon({
    className: "wp-waypoint-pin",
    iconSize: [90, 28],
    iconAnchor: [14, 14],
    html: `<div style="display:flex; align-items:center; gap:6px; background:#FFFFFF; border:1px solid #E4E2DC; padding:2px 8px; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,0.08); font-family:Inter,sans-serif;">
      <div style="width:9px; height:9px; border-radius:50%; background:#F45B22;"></div>
      <span style="font-size:11px; font-weight:700; color:#151A23;">${label}</span>
    </div>`,
  });
}

function useLiveLocation() {
  const [location, setLocation] = useState<[number, number]>([27.65, 76.4]);
  const [isLive, setIsLive] = useState(false);
  const [status, setStatus] = useState<"locating" | "active" | "denied" | "unsupported">("locating");

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation([pos.coords.latitude, pos.coords.longitude]);
        setIsLive(true);
        setStatus("active");
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
        setStatus("denied");
        setIsLive(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return { location, isLive, status, requestLocation };
}

function AutoSize() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    const el = map.getContainer();
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(el);

    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

function MapController() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(DEMO_ROUTE_POINTS), { padding: [40, 40], animate: false });
  }, [map]);
  return null;
}

function LiveMap({ mapStyle, onSelectWp }: { mapStyle: MapStyleKey; onSelectWp: (id: string) => void }) {
  const config = getSafeMapStyle(mapStyle);

  return (
    <div className={cn("h-full w-full", config.is3D && "map-3d-perspective", config.filterClass)}>
      <MapContainer
        center={[27.65, 76.4]}
        zoom={8}
        minZoom={4}
        scrollWheelZoom={true}
        zoomControl={true}
        className="h-full w-full min-h-[450px]"
        attributionControl={false}
      >
        <TileLayer
          key={config.key}
          url={config.url}
          attribution={config.attribution}
          subdomains={config.subdomains || "abc"}
          maxZoom={config.maxZoom}
        />
        <AutoSize />
        <MapController />

        {/* Route Polyline */}
        <Polyline
          positions={DEMO_ROUTE_POINTS}
          pathOptions={{
            color: "#151A23",
            weight: 3.5,
            opacity: 0.9,
          }}
        />

        {/* Route Markers */}
        {DEMO_WAYPOINTS.map((wp) => (
          <Marker
            key={wp.id}
            position={wp.pos}
            icon={wp.type === "wp" ? waypointPinIcon(wp.name) : originPinIcon(wp.name)}
            eventHandlers={{ click: () => onSelectWp(wp.id) }}
          />
        ))}
      </MapContainer>
    </div>
  );
}

// 6-stage interactive product story definitions
const STAGES = [
  {
    num: "01",
    title: "Map the Corridor",
    icon: Map,
    short: "Trace your route and identify the best places along the way.",
    detail: "Google Maps Directions traces the actual driving corridor. Every town, junction, and bypass along the route is mapped and verified — never assumed.",
    metrics: ["280 km traced", "4 corridor towns", "Live traffic graph"],
  },
  {
    num: "02",
    title: "Discover Experiences",
    icon: Search,
    short: "Find relevant experiences that match your interests and route.",
    detail: "Fires 15–25 SerpApi searches targeted along the corridor based on your selected interests (Food, Heritage, Culture). Places off-route are discarded.",
    metrics: ["18 candidates", "SerpApi live facts", "Route fit filtering"],
  },
  {
    num: "03",
    title: "Check Time Windows",
    icon: Clock,
    short: "Verify opening hours, events and real-time conditions.",
    detail: "Computes exact arrival times per stop. Fetches live opening hours, closure warnings, and sunset times. Places closed upon arrival are filtered out.",
    metrics: ["Live operating hours", "Sunset timing", "Zero closed recommendations"],
  },
  {
    num: "04",
    title: "Score & Rank",
    icon: Star,
    short: "Rank by preference fit, temporal fit, route fit and quality.",
    detail: "Calculates a 6-component composite match score (0–100) weighing preference alignment, temporal feasibility, detour cost, ratings, and evidence.",
    metrics: ["6-component model", "Detour cost penalty", "Evidence weighting"],
  },
  {
    num: "05",
    title: "Stress Test",
    icon: Zap,
    short: "Simulate delays and disruptions to check plan resilience.",
    detail: "Runs 6 disruption scenarios (+15m to +60m delays, unexpected venue closures, event shifts) to measure your itinerary's robustness score.",
    metrics: ["+45 min delay test", "Deterministic graph", "Robustness index"],
  },
  {
    num: "06",
    title: "Auto-Recover",
    icon: RefreshCw,
    short: "Find validated alternatives when something changes.",
    detail: "If a disruption makes a stop infeasible, auto-recovery identifies a validated alternative in the corridor operating at your new arrival time.",
    metrics: ["Instant replanning", "Same arrival window", "Zero ruined trips"],
  },
];

type ViewAnimationProps = {
  delay?: number;
  className?: string;
  children: React.ReactNode;
};

function AnimatedContainer({ className, delay = 0.1, children }: ViewAnimationProps) {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function HomePage() {
  const { location, isLive, status, requestLocation } = useLiveLocation();
  const [activeStage, setActiveStage] = useState(0);
  const [selectedWp, setSelectedWp] = useState<string>("neemrana");
  const [wpCardOpen, setWpCardOpen] = useState(true);

  const [mapStyle, setMapStyle] = useState<MapStyleKey>(() => {
    try {
      const stored = localStorage.getItem("wp:map_style") as MapStyleKey;
      return stored && stored in MAP_STYLES ? stored : DEFAULT_MAP_STYLE;
    } catch {
      return DEFAULT_MAP_STYLE;
    }
  });

  const changeStyle = (style: MapStyleKey) => {
    setMapStyle(style);
    try { localStorage.setItem("wp:map_style", style); } catch {}
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="min-h-dvh bg-[#F8F7F3] flex flex-col"
    >
      <TopBar />

      {/*
        ─── MAIN EXPLORE PAGE — SPLIT SPATIAL EDITORIAL LAYOUT ───────────────────
        LEFT (35%): Sits directly on #F8F7F3 background with whitespace
        RIGHT (65%): DOMINANT SPATIAL REAL MAP WITH FLOATING OVERLAYS
      */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[440px_1fr] border-b border-[#E4E2DC]">

        {/* ── LEFT PANEL: Editorial text & planning form ── */}
        <div className="flex flex-col justify-between p-6 md:p-8 bg-[#F8F7F3] border-r border-[#E4E2DC] space-y-6 lg:h-[calc(100vh-48px)] lg:overflow-y-auto scroll-thin">

          <div className="space-y-6">

            {/* Editorial Header */}
            <div>
              <span className="text-[10px] tracking-[0.14em] text-[#F45B22] uppercase mb-2 block font-bold">
                ● SERPAPI INDIA HACKATHON · TRAVEL & LOCAL DISCOVERY
              </span>
              <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-[-0.045em] text-[#151A23] leading-[0.98] font-author">
                Plan around<br />the moment.
              </h1>
              <p className="mt-3 text-sm text-[#333742] font-medium leading-relaxed font-sans max-w-sm">
                Find experiences that still work when you arrive.
              </p>
            </div>

            {/* Route Planner Card */}
            <RouteCommandBar />

            {/* Quick Demo Section with thin divider above */}
            <div className="pt-4 border-t border-[#E4E2DC] flex items-center justify-between">
              <span className="eyebrow text-[10px] tracking-[0.14em] text-[#151A23] uppercase font-bold">
                QUICK DEMO
              </span>
              <DemoButton />
            </div>

          </div>

          {/* Temporal Intelligence Note with thin divider */}
          <div className="pt-4 border-t border-[#E4E2DC] flex items-start gap-2.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#F45B22" xmlns="http://www.w3.org/2000/svg" className="shrink-0 mt-0.5">
              <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
            </svg>
            <div>
              <span className="eyebrow text-[10px] tracking-[0.14em] text-[#151A23] uppercase block mb-0.5 font-bold">
                TEMPORAL ROUTE INTELLIGENCE
              </span>
              <p className="text-xs text-[#2D3440] font-medium leading-normal font-sans">
                Not just where to go — but what will actually work when you get there.
              </p>
            </div>
          </div>

        </div>

        {/* ── RIGHT VIEWPORT: Dominant Spatial Map ── */}
        <div className="relative w-full h-[500px] lg:h-[calc(100vh-48px)] overflow-hidden">

          {/* Leaflet Map */}
          <div className="absolute inset-0 z-0 w-full h-full">
            <LiveMap mapStyle={mapStyle} onSelectWp={(id) => { setSelectedWp(id); setWpCardOpen(true); }} />
          </div>

          {/* Map Controls & Layers Top-Right */}
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2 md:right-6">
            <div className="bg-white flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-[#151A23] shadow-sm rounded-lg border border-[#E4E2DC]">
              <Layers className="h-3.5 w-3.5 text-[#F45B22]" />
              <span>4 stops · 5h 42m</span>
              <ChevronRight className="h-3.5 w-3.5 text-[#667085]" />
            </div>
            <MapStyleSelector currentStyle={mapStyle} onSelectStyle={changeStyle} />
          </div>

          {/* Bottom-Left Floating Route Summary Card */}
          <div className="absolute left-4 bottom-4 z-10 hidden sm:block max-w-xs bg-white border border-[#E4E2DC] rounded-xl p-4 shadow-[0_4px_16px_rgba(20,25,35,0.08)]">
            <div className="eyebrow text-[9.5px] tracking-[0.14em] text-[#667085] uppercase font-bold mb-1">
              ROUTE SUMMARY
            </div>
            <div className="text-sm font-bold text-[#151A23] mb-1">
              Delhi → Jaipur
            </div>
            <div className="text-xs text-[#4B5563] font-semibold mb-2">
              5h 42m · 280 km
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#168A5B] font-bold">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#168A5B] shrink-0" />
              <span>3 experiences fit your arrival windows</span>
              <ChevronRight className="h-3.5 w-3.5 text-[#168A5B]" />
            </div>
          </div>

          {/* Bottom-Right Floating Waypoint Detail Card */}
          <AnimatePresence>
            {wpCardOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="absolute right-4 bottom-4 z-10 w-72 bg-white border border-[#E4E2DC] rounded-xl p-4 shadow-[0_6px_20px_rgba(20,25,35,0.1)]"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="eyebrow text-[9.5px] tracking-[0.14em] text-[#667085] font-bold">
                    02 · WAYPOINT
                  </div>
                  <button
                    onClick={() => setWpCardOpen(false)}
                    className="text-[#667085] hover:text-[#151A23] p-0.5 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex gap-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-[#FFF4EF] border border-[#F45B22]/20 flex items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-[#F45B22]">🏰</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#151A23] leading-snug">
                      {selectedWp === "neemrana" ? "Neemrana Fort" : selectedWp === "alwar" ? "Alwar City Palace" : "Delhi Start"}
                    </h4>
                    <p className="text-xs text-[#4B5563] font-medium mt-0.5">
                      11:30 AM — 1:30 PM
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[#E4E2DC] pt-2.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E6F4ED] text-[#168A5B] border border-[#C3E8D5]">
                    OPEN AT ARRIVAL
                  </span>
                  <span className="text-[10.5px] text-[#667085] font-medium">
                    +18 min · +7 km
                  </span>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#E4E2DC] flex items-center justify-between">
                  <DemoButton className="w-full justify-center !bg-[#151A23] !text-white !border-[#151A23] hover:!bg-[#F45B22] hover:!border-[#F45B22]" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

      </div>

      {/*
        ─── BELOW-THE-FOLD: HOW WAYPOINTS WORKS (INTERACTIVE 6-STAGE PIPELINE) ────
        Replaces generic cards with interactive product story matching the reference.
      */}
      <section className="border-t border-[#E4E2DC] py-16 md:py-24 bg-[#F8F7F3]">
        <div className="mx-auto w-full max-w-6xl px-4 space-y-12">

          {/* Header */}
          <AnimatedContainer className="mx-auto max-w-3xl text-center">
            <p className="eyebrow mb-2 text-[10px] tracking-[0.14em] text-[#667085] font-bold uppercase">
              HOW WAYPOINTS WORKS
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#151A23] text-balance md:text-4xl lg:text-5xl font-author leading-tight">
              From route to real<br />experiences — in 6 steps.
            </h2>
            <p className="mt-3 text-sm text-[#4B5563] font-medium text-balance md:text-base leading-relaxed max-w-xl mx-auto font-sans">
              We combine spatial planning with temporal reasoning to build itineraries that actually work.
            </p>
          </AnimatedContainer>

          {/* Horizontal 6-Stage Process Pipeline */}
          <AnimatedContainer delay={0.2} className="relative">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {STAGES.map((s, idx) => {
                const isSelected = activeStage === idx;
                const Icon = s.icon;
                return (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => setActiveStage(idx)}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-xl border text-left transition-all cursor-pointer relative",
                      isSelected
                        ? "bg-white border-[#F45B22] shadow-[0_4px_16px_rgba(244,91,34,0.12)]"
                        : "bg-white/60 border-[#E4E2DC] hover:border-[#F45B22]/50 hover:bg-white"
                    )}
                  >
                    {/* Stage icon circle */}
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center mb-3 transition-colors",
                      isSelected ? "bg-[#FFF4EF] text-[#F45B22] border border-[#F45B22]/30" : "bg-[#F0EFEA] text-[#667085]"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <span className="text-[10px] font-bold text-[#667085] tracking-wider mb-1">
                      {s.num}
                    </span>
                    <h3 className="text-xs font-bold text-[#151A23] mb-1.5 leading-snug">
                      {s.title}
                    </h3>
                    <p className="text-[11px] text-[#4B5563] font-medium leading-normal line-clamp-3">
                      {s.short}
                    </p>

                    {isSelected && (
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-[#F45B22] rotate-45" />
                    )}
                  </button>
                );
              })}
            </div>
          </AnimatedContainer>

          {/* Interactive Live Demonstration Panel for Selected Stage */}
          <AnimatedContainer delay={0.3}>
            <div className="bg-white border border-[#E4E2DC] rounded-2xl p-6 md:p-8 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E4E2DC] pb-5 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FFF4EF] border border-[#F45B22]/30 flex items-center justify-center text-[#F45B22] font-bold">
                    {STAGES[activeStage].num}
                  </div>
                  <div>
                    <span className="eyebrow text-[9.5px] text-[#F45B22] font-bold">
                      STAGE {STAGES[activeStage].num} DEMONSTRATION
                    </span>
                    <h3 className="text-xl font-bold text-[#151A23] font-author">
                      {STAGES[activeStage].title}
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {STAGES[activeStage].metrics.map((m, i) => (
                    <span key={i} className="px-3 py-1 rounded-full bg-[#FAFAF8] border border-[#E4E2DC] text-xs font-semibold text-[#151A23]">
                      ✓ {m}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-sm text-[#2D3440] font-medium leading-relaxed max-w-3xl mb-6">
                {STAGES[activeStage].detail}
              </p>

              <div className="pt-4 border-t border-[#E4E2DC] flex flex-wrap items-center justify-between gap-4">
                <span className="text-xs text-[#667085] font-medium">
                  Click any of the 6 steps above to inspect how WAYPOINTS processes live spatial & temporal signals.
                </span>
                <DemoButton className="!bg-[#F45B22] !text-white !border-[#F45B22] hover:!bg-[#D94A18]" />
              </div>
            </div>
          </AnimatedContainer>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E4E2DC] bg-[#F8F7F3]">
        <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 flex flex-col gap-2 md:flex-row md:justify-between md:items-center">
          <span className="text-xs text-[#2D3440] font-medium">
            <span className="font-sans font-bold text-[#151A23] tracking-wider">WAYPOINTS</span>
            {" "}— Temporal Route Intelligence · SerpApi India Hackathon 2026
          </span>
          <span className="text-[11px] text-[#4B5563] font-medium">
            Reasoning by Groq · Map © OpenMapTiles, OpenStreetMap · SerpApi live data
          </span>
        </div>
      </footer>
    </motion.div>
  );
}
