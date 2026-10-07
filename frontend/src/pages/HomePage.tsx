import { useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Clock, Map, BarChart2, Zap, Wrench, Navigation, Locate
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { RouteCommandBar, DemoButton } from "@/components/home/PlanForm";
import { FeatureCard } from "@/components/ui/grid-feature-cards";
import { MAP_STYLES, DEFAULT_MAP_STYLE, getSafeMapStyle, type MapStyleKey } from "@/lib/map-styles";
import { MapStyleSelector } from "@/components/route/MapControls";
import { cn } from "@/lib/utils";

// Custom light editorial marker icon for user live location
function liveLocationIcon() {
  return L.divIcon({
    className: "wp-live-location-pin",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="
      position:relative; width:36px; height:36px;
      display:grid; place-items:center;
    ">
      <div style="
        position:absolute; inset:0; border-radius:50%;
        background:rgba(244,91,34,0.25); border:1.5px solid rgba(244,91,34,0.6);
        animation: wp-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
      "></div>
      <div style="
        width:14px; height:14px; border-radius:50%;
        background:#F45B22; border:2.5px solid #FFFFFF;
        box-shadow:0 2px 8px rgba(20,25,35,0.15);
      "></div>
    </div>`,
  });
}

function useLiveLocation() {
  const [location, setLocation] = useState<[number, number]>([28.6139, 77.2090]);
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

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  const centerKey = `${center[0].toFixed(5)},${center[1].toFixed(5)}`;

  useEffect(() => {
    map.invalidateSize();
    map.flyTo(center, 13, { duration: 1.2 });
  }, [centerKey, map]);

  return null;
}

function LiveMap({ center, isLive, mapStyle }: { center: [number, number]; isLive: boolean; mapStyle: MapStyleKey }) {
  const config = getSafeMapStyle(mapStyle);

  return (
    <div className={cn("h-full w-full", config.is3D && "map-3d-perspective", config.filterClass)}>
      <MapContainer
        center={center}
        zoom={13}
        minZoom={3}
        scrollWheelZoom={true}
        zoomControl={true}
        className="h-full w-full min-h-[400px]"
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
        <MapController center={center} />
        <Marker position={center} icon={liveLocationIcon()}>
          <Tooltip permanent direction="top" offset={[0, -18]} className="wp-tip">
            {isLive ? "Your Live Location" : "Default Location"}
          </Tooltip>
        </Marker>
      </MapContainer>
    </div>
  );
}

// 8-stage pipeline features
const PIPELINE_FEATURES = [
  {
    title: "Map the Corridor",
    icon: Map,
    description: "Google Maps Directions traces the real route. Every town along the way is verified — never assumed.",
  },
  {
    title: "Discover Along the Way",
    icon: Navigation,
    description: "15–25 Maps searches fire along the corridor, not just at the destination. Route-aware from the start.",
  },
  {
    title: "Check Opening Windows",
    icon: Clock,
    description: "Live hours + visitor reviews fetched per finalist. A place closed at your arrival time is never recommended.",
  },
  {
    title: "Temporal Scoring",
    icon: BarChart2,
    description: "6-component score weighs preference fit, temporal fit, route fit, quality, evidence, and live signals.",
  },
  {
    title: "Stress Test the Plan",
    icon: Zap,
    description: "6 disruption scenarios — delays, closures, event shifts. Re-runs the full temporal graph deterministically.",
  },
  {
    title: "Auto-Recovery",
    icon: Wrench,
    description: "Broken stops get replaced by validated alternatives at the new arrival time. Backend-verified, not guessed.",
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
        RIGHT (65%): DOMINANT SPATIAL REAL MAP
      */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[440px_1fr] border-b border-[#E4E2DC]">

        {/* ── LEFT PANEL: Editorial text & planning form ── */}
        <div className="flex flex-col justify-between p-6 md:p-8 bg-[#F8F7F3] border-r border-[#E4E2DC] space-y-6 lg:h-[calc(100vh-48px)] lg:overflow-y-auto scroll-thin">

          <div className="space-y-6">

            {/* Editorial Header */}
            <div>
              <span className="eyebrow text-[10px] tracking-[0.14em] text-[#667085] uppercase mb-2 block font-bold">
                EXPLORE
              </span>
              <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-[-0.045em] text-[#151A23] leading-[0.98] font-author">
                Plan around<br />the moment.
              </h1>
              <p className="mt-3 text-sm text-[#2D3440] font-medium leading-relaxed font-sans max-w-sm">
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
          <div className="pt-4 border-t border-[#E4E2DC]">
            <span className="eyebrow text-[10px] tracking-[0.14em] text-[#151A23] uppercase block mb-1 font-bold">
              TEMPORAL ROUTE INTELLIGENCE
            </span>
            <p className="text-xs text-[#2D3440] font-medium leading-normal font-sans">
              Not just where to go — but what will actually work when you get there.
            </p>
          </div>

        </div>

        {/* ── RIGHT VIEWPORT: Dominant Spatial Map ── */}
        <div className="relative w-full h-[500px] lg:h-[calc(100vh-48px)]">

          {/* Leaflet Map */}
          <div className="absolute inset-0 z-0 w-full h-full">
            <LiveMap center={location} isLive={isLive} mapStyle={mapStyle} />
          </div>

          {/* Map style selector & Live location status overlay (top-right) */}
          <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2 md:right-6">
            <div className="flex items-center gap-2">
              <MapStyleSelector currentStyle={mapStyle} onSelectStyle={changeStyle} />

              <div className="bg-white flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[#151A23] shadow-sm rounded-[8px] border border-[#E4E2DC]">
                <span className={cn(
                  "status-dot",
                  status === "active" ? "open" : status === "locating" ? "closing" : "closed"
                )} />
                {status === "active" && (
                  <span className="tnum font-semibold text-[#151A23]">● Live location</span>
                )}
                {status === "locating" && <span className="text-[#2D3440] font-medium">Detecting location...</span>}
                {status === "denied" && <span className="text-[#2D3440] font-medium">Location access denied</span>}
                {status === "unsupported" && <span className="text-[#2D3440] font-medium">Geolocation unavailable</span>}

                <button
                  type="button"
                  onClick={requestLocation}
                  title="Recenter to live location"
                  className="ml-1 text-[#667085] hover:text-[#151A23] transition-colors p-0.5 cursor-pointer"
                >
                  <Locate className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/*
        ─── BELOW-THE-FOLD: Product Capabilities ─────────────────────────
        Light editorial explanation of temporal route intelligence.
      */}
      <section className="border-t border-[#E4E2DC] py-16 md:py-24 bg-[#F8F7F3]">
        <div className="mx-auto w-full max-w-5xl px-4 space-y-12">

          {/* Header */}
          <AnimatedContainer className="mx-auto max-w-3xl text-center">
            <p className="eyebrow mb-2 text-[10px] tracking-[0.14em] text-[#F45B22] font-bold">8-STAGE DISCOVERY PIPELINE</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#151A23] text-balance md:text-4xl lg:text-5xl">
              Temporal Route Intelligence.
            </h2>
            <p className="mt-3 text-sm text-[#2D3440] font-medium text-balance md:text-base leading-relaxed max-w-xl mx-auto font-sans">
              Not just where to go — whether each stop will <em className="text-[#151A23] font-bold not-italic">still work</em> when you actually get there.
              Every stage below runs live against real SerpApi data.
            </p>
          </AnimatedContainer>

          {/* Feature grid */}
          <AnimatedContainer
            delay={0.2}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
          >
            {PIPELINE_FEATURES.map((feature, i) => (
              <FeatureCard
                key={i}
                feature={feature}
                className="rounded-xl shadow-sm"
              />
            ))}
          </AnimatedContainer>

          {/* Differentiators strip */}
          <AnimatedContainer delay={0.3} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Temporal City Graph",  detail: "Scored for your arrival time, not in general" },
              { label: "Detour Economics",      detail: '+12 min · +2 km · ₹40 — not just "2 km away"' },
              { label: "Plan Stress Test",      detail: "Break it on purpose, then auto-repair" },
              { label: "Evidence-First AI",     detail: "SerpApi facts only — nothing invented" },
            ].map((d) => (
              <div key={d.label} className="bg-white border border-[#E4E2DC] rounded-xl px-5 py-5 shadow-sm">
                <div className="text-sm font-bold text-[#151A23] mb-1.5 font-author">{d.label}</div>
                <div className="text-xs text-[#2D3440] font-medium leading-relaxed">{d.detail}</div>
              </div>
            ))}
          </AnimatedContainer>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E4E2DC] bg-[#F8F7F3]">
        <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 flex flex-col gap-2 md:flex-row md:justify-between md:items-center">
          <span className="text-xs text-[#2D3440] font-medium">
            <span className="font-mono font-bold text-[#151A23] tracking-wider">WAYPOINTS</span>
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
