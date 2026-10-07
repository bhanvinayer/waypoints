import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { ExperienceNode, JourneyResponse, SliceNode, Tone, Waypoint } from "@/lib/types";
import { fmtClock } from "@/lib/time";
import { MAP_STYLES, DEFAULT_MAP_STYLE, getSafeMapStyle, type MapStyleKey } from "@/lib/map-styles";
import { MapStyleSelector } from "./MapControls";
import { cn } from "@/lib/utils";

interface Props {
  journey: JourneyResponse;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  slice?: Map<string, SliceNode>;
  extra?: ExperienceNode[];
  className?: string;
}

/** Pin icon — dark numeric node, orange when selected */
function pinIcon(wp: Waypoint, tone: Tone, selected: boolean, opacity: number, showTime: boolean) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div class="wp-pin ${tone} ${selected ? "sel" : ""}" style="opacity:${opacity}">${wp.order}${
      showTime ? `<span class="t">${fmtClock(wp.arrival_min, { short: true })}</span>` : ""
    }</div>`,
  });
}

/** Small dot for pool/alternative nodes */
function dotIcon(tone: Tone, opacity: number, size: number) {
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="wp-dot ${tone}" style="opacity:${opacity};width:${size}px;height:${size}px"></div>`,
  });
}

/** Origin / destination endpoints */
function endIcon(dest: boolean) {
  return L.divIcon({
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div class="wp-end ${dest ? "dest" : ""}"></div>`,
  });
}

/** Corridor town label */
function townIcon() {
  return L.divIcon({
    className: "",
    iconSize: [6, 6],
    iconAnchor: [3, 3],
    html: `<div style="width:6px;height:6px;border-radius:99px;background:#383838;border:1px solid #505050"></div>`,
  });
}

function AutoSize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function Fit({ points, signature }: { points: [number, number][]; signature: string }) {
  const map = useMap();
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [48, 56],
        paddingBottomRight: [48, desktop ? 160 : 56],
        animate: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);
  return null;
}

function Focus({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 11), { duration: 0.6 });
  }, [target, map]);
  return null;
}

/** Fan out overlapping pins, connect to true position with dashed line */
function SpreadPins({
  waypoints,
  slice,
  selectedId,
  onSelect,
}: {
  waypoints: Waypoint[];
  slice?: Map<string, SliceNode>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const placed = useMemo(() => {
    const taken: L.Point[] = [];
    return waypoints.map((w) => {
      const origin = L.latLng(w.latitude, w.longitude);
      const p = map.latLngToLayerPoint(origin);
      let q = p;
      let k = 0;
      while (taken.some((o) => o.distanceTo(q) < 38) && k < 14) {
        const ang = ((k * 62 - 90) * Math.PI) / 180;
        const r = 44 + Math.floor(k / 6) * 24;
        q = L.point(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r);
        k++;
      }
      taken.push(q);
      return { w, origin, pos: k ? map.layerPointToLatLng(q) : origin, shifted: k > 0 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, waypoints, map]);

  return (
    <>
      {/* Connector lines to spread pins */}
      {placed.filter((x) => x.shifted).map(({ w, origin, pos }) => (
        <Polyline
          key={`l${w.id}`}
          positions={[origin, pos]}
          pathOptions={{
            color: "#383838",
            weight: 1,
            opacity: 0.6,
            dashArray: "2 5",
          }}
          interactive={false}
        />
      ))}

      {/* Waypoint pins */}
      {placed.map(({ w, pos }) => {
        const s = slice?.get(w.id);
        const tone: Tone = s ? s.tone : w.tone;
        const opacity = s && tone === "red" ? 0.3 : 1;
        return (
          <Marker
            key={w.id}
            position={pos}
            icon={pinIcon(w, tone, selectedId === w.id, opacity, !slice)}
            eventHandlers={{ click: () => onSelect(w.id) }}
            zIndexOffset={1000 + (selectedId === w.id ? 500 : 0)}
          >
            <Tooltip direction="top" offset={[0, -16]} className="wp-tip">
              {w.name}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

export function MapView({ journey, selectedId, onSelect, slice, extra = [], className }: Props) {
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

  const config = getSafeMapStyle(mapStyle);

  const poly = useMemo(
    () => journey.route.polyline.map((p) => [p[0], p[1]] as [number, number]),
    [journey.route.polyline]
  );
  const wpIds = useMemo(() => new Set(journey.waypoints.map((w) => w.id)), [journey.waypoints]);

  const others = useMemo(() => {
    const seen = new Set<string>(wpIds);
    const list: { node: ExperienceNode; alt: boolean }[] = [];
    for (const n of journey.alternatives)
      if (!seen.has(n.id)) { seen.add(n.id); list.push({ node: n, alt: true }); }
    for (const n of journey.pool)
      if (!seen.has(n.id)) { seen.add(n.id); list.push({ node: n, alt: false }); }
    for (const n of extra)
      if (!seen.has(n.id)) { seen.add(n.id); list.push({ node: n, alt: true }); }
    return list;
  }, [journey.alternatives, journey.pool, extra, wpIds]);

  const all = useMemo(
    () => [...journey.waypoints, ...others.map((o) => o.node)],
    [journey.waypoints, others]
  );
  const selected = selectedId ? all.find((n) => n.id === selectedId) : null;
  const focusTarget = useMemo<[number, number] | null>(
    () => (selected ? [selected.latitude, selected.longitude] : null),
    [selected]
  );
  const fitPoints = useMemo<[number, number][]>(
    () =>
      poly.length
        ? poly
        : [
            [journey.origin.latitude, journey.origin.longitude],
            [journey.destination.latitude, journey.destination.longitude],
          ],
    [poly, journey]
  );

  return (
    <div className={cn("relative h-full w-full", className, config.is3D && "map-3d-perspective", config.filterClass)}>
      <MapContainer
        center={[journey.origin.latitude, journey.origin.longitude]}
        zoom={7}
        minZoom={4}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        attributionControl
      >
        <TileLayer
          key={config.key}
          url={config.url}
          attribution={config.attribution}
          subdomains={config.subdomains || "abc"}
          maxZoom={config.maxZoom}
        />

        <AutoSize />
        <Fit points={fitPoints} signature={journey.journey_id} />
        <Focus target={focusTarget} />

        {/* Route: ghost base + active line */}
        <Polyline
          positions={poly}
          pathOptions={{
            className: "wp-route-base",
            color: "#1A1A1A",
            weight: 8,
            opacity: 0.5,
          }}
        />
        <Polyline
          positions={poly}
          pathOptions={{
            className: "wp-route-base",
            color: "#FFFFFF",
            weight: 2,
            opacity: 0.9,
          }}
        />
        {/* Animated march overlay */}
        <Polyline
          positions={poly}
          pathOptions={{
            className: "wp-route-flow",
            color: "#E8651A",
            weight: 2,
            opacity: 0.5,
          }}
        />

        {/* Corridor town dots */}
        {journey.route.corridor.map((t) => (
          <Marker
            key={t.name}
            position={[t.latitude, t.longitude]}
            icon={townIcon()}
            interactive={false}
          >
            <Tooltip permanent direction="right" offset={[5, 0]} className="wp-town">
              {t.name}
            </Tooltip>
          </Marker>
        ))}

        {/* Origin */}
        <Marker
          position={[journey.origin.latitude, journey.origin.longitude]}
          icon={endIcon(false)}
          interactive={false}
        >
          <Tooltip permanent direction="left" offset={[-6, 0]} className="wp-tip">
            {journey.origin.name.split(",")[0]}
          </Tooltip>
        </Marker>

        {/* Destination */}
        <Marker
          position={[journey.destination.latitude, journey.destination.longitude]}
          icon={endIcon(true)}
          interactive={false}
        >
          <Tooltip permanent direction="right" offset={[6, 0]} className="wp-tip">
            {journey.destination.name.split(",")[0]}
          </Tooltip>
        </Marker>

        {/* Pool / alternative dots */}
        {others.map(({ node, alt }) => {
          const s = slice?.get(node.id);
          const tone: Tone = s ? s.tone : "gray";
          const opacity = s
            ? tone === "red" ? 0.18 : tone === "yellow" ? 0.7 : 1
            : alt ? 0.8 : 0.5;
          const size = s && tone !== "red" ? 14 : alt ? 12 : 10;
          return (
            <Marker
              key={node.id}
              position={[node.latitude, node.longitude]}
              icon={dotIcon(tone, opacity, size)}
              eventHandlers={{ click: () => onSelect(node.id) }}
              zIndexOffset={selectedId === node.id ? 900 : 0}
            >
              <Tooltip direction="top" offset={[0, -4]} className="wp-tip">
                {node.name}
                {s ? ` · ${Math.round(s.fit * 100)}%` : alt ? " · alt" : ""}
              </Tooltip>
            </Marker>
          );
        })}

        {/* Primary waypoint pins */}
        <SpreadPins
          waypoints={journey.waypoints}
          slice={slice}
          selectedId={selectedId}
          onSelect={(id) => onSelect(id)}
        />
      </MapContainer>

      {/* Floating map style selector top-right */}
      <MapStyleSelector
        currentStyle={mapStyle}
        onSelectStyle={changeStyle}
        className="absolute top-3 right-3 z-[1000]"
      />
    </div>
  );
}
