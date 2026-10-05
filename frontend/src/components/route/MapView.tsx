import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { ExperienceNode, JourneyResponse, SliceNode, Tone, Waypoint } from "@/lib/types";
import { fmtClock } from "@/lib/time";

interface Props {
  journey: JourneyResponse;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  slice?: Map<string, SliceNode>;
  extra?: ExperienceNode[]; // e.g. segment-discovery candidates
  className?: string;
}

function pinIcon(wp: Waypoint, tone: Tone, selected: boolean, opacity: number, showTime: boolean) {
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="wp-pin ${tone} ${selected ? "sel" : ""}" style="opacity:${opacity}">${wp.order}${showTime ? `<span class="t">${fmtClock(wp.arrival_min, { short: true })}</span>` : ""}</div>`,
  });
}

function dotIcon(tone: Tone, opacity: number, size: number) {
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="wp-dot ${tone}" style="opacity:${opacity};width:${size}px;height:${size}px"></div>`,
  });
}

function endIcon(dest: boolean) {
  return L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="wp-end ${dest ? "dest" : ""}"></div>` });
}

function townIcon() {
  return L.divIcon({ className: "", iconSize: [8, 8], iconAnchor: [4, 4], html: `<div style="width:8px;height:8px;border-radius:99px;background:#fff;border:2px solid #3b5750"></div>` });
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
    // leave room for the time slider that floats over the bottom of the map on desktop
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [56, 56], paddingBottomRight: [56, desktop ? 230 : 56], animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);
  return null;
}

function Focus({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 11), { duration: 0.8 });
  }, [target, map]);
  return null;
}

/** Stops that would sit on top of each other (several sights in one city) are fanned out, joined to their true spot by a dotted line. */
function SpreadPins({ waypoints, slice, selectedId, onSelect }: { waypoints: Waypoint[]; slice?: Map<string, SliceNode>; selectedId: string | null; onSelect: (id: string) => void }) {
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
      while (taken.some((o) => o.distanceTo(q) < 40) && k < 14) {
        const ang = ((k * 62 - 90) * Math.PI) / 180;
        const r = 46 + Math.floor(k / 6) * 26;
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
      {placed.filter((x) => x.shifted).map(({ w, origin, pos }) => (
        <Polyline key={`l${w.id}`} positions={[origin, pos]} pathOptions={{ color: "#10211D", weight: 1.5, opacity: 0.45, dashArray: "2 4" }} interactive={false} />
      ))}
      {placed.map(({ w, pos }) => {
        const s = slice?.get(w.id);
        const tone: Tone = s ? s.tone : w.tone;
        const opacity = s && tone === "red" ? 0.3 : 1;
        return (
          <Marker key={w.id} position={pos} icon={pinIcon(w, tone, selectedId === w.id, opacity, !slice)} eventHandlers={{ click: () => onSelect(w.id) }} zIndexOffset={1000 + (selectedId === w.id ? 500 : 0)}>
            <Tooltip direction="top" offset={[0, -18]} className="wp-tip">{w.name}</Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

export function MapView({ journey, selectedId, onSelect, slice, extra = [], className }: Props) {
  const poly = useMemo(() => journey.route.polyline.map((p) => [p[0], p[1]] as [number, number]), [journey.route.polyline]);
  const wpIds = useMemo(() => new Set(journey.waypoints.map((w) => w.id)), [journey.waypoints]);
  const others = useMemo(() => {
    const seen = new Set<string>(wpIds);
    const list: { node: ExperienceNode; alt: boolean }[] = [];
    for (const n of journey.alternatives) if (!seen.has(n.id)) { seen.add(n.id); list.push({ node: n, alt: true }); }
    for (const n of journey.pool) if (!seen.has(n.id)) { seen.add(n.id); list.push({ node: n, alt: false }); }
    for (const n of extra) if (!seen.has(n.id)) { seen.add(n.id); list.push({ node: n, alt: true }); }
    return list;
  }, [journey.alternatives, journey.pool, extra, wpIds]);

  const all = useMemo(() => [...journey.waypoints, ...others.map((o) => o.node)], [journey.waypoints, others]);
  const selected = selectedId ? all.find((n) => n.id === selectedId) : null;
  const focusTarget = useMemo<[number, number] | null>(() => (selected ? [selected.latitude, selected.longitude] : null), [selected]);
  const fitPoints = useMemo<[number, number][]>(() => (poly.length ? poly : [[journey.origin.latitude, journey.origin.longitude], [journey.destination.latitude, journey.destination.longitude]]), [poly, journey]);

  return (
    <MapContainer
      center={[journey.origin.latitude, journey.origin.longitude]}
      zoom={7}
      minZoom={4}
      scrollWheelZoom
      zoomControl={false}
      className={className ?? "h-full w-full"}
      attributionControl
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
        maxZoom={16}
      />
      <AutoSize />
      <Fit points={fitPoints} signature={journey.journey_id} />
      <Focus target={focusTarget} />

      <Polyline positions={poly} pathOptions={{ className: "wp-route-base", color: "#10211D", weight: 7, opacity: 0.14 }} />
      <Polyline positions={poly} pathOptions={{ className: "wp-route-flow", color: "#E8501C", weight: 4, opacity: 0.95 }} />

      {journey.route.corridor.map((t) => (
        <Marker key={t.name} position={[t.latitude, t.longitude]} icon={townIcon()} interactive={false}>
          <Tooltip permanent direction="right" offset={[6, 0]} className="wp-town">{t.name}</Tooltip>
        </Marker>
      ))}

      <Marker position={[journey.origin.latitude, journey.origin.longitude]} icon={endIcon(false)} interactive={false}>
        <Tooltip permanent direction="left" offset={[-8, 0]} className="wp-tip">{journey.origin.name.split(",")[0]}</Tooltip>
      </Marker>
      <Marker position={[journey.destination.latitude, journey.destination.longitude]} icon={endIcon(true)} interactive={false}>
        <Tooltip permanent direction="right" offset={[8, 0]} className="wp-tip">{journey.destination.name.split(",")[0]}</Tooltip>
      </Marker>

      {others.map(({ node, alt }) => {
        const s = slice?.get(node.id);
        const tone: Tone = s ? s.tone : "gray";
        const opacity = s ? (tone === "red" ? 0.18 : tone === "yellow" ? 0.75 : 1) : alt ? 0.9 : 0.6;
        const size = s && tone !== "red" ? 18 : alt ? 15 : 12;
        return (
          <Marker key={node.id} position={[node.latitude, node.longitude]} icon={dotIcon(tone, opacity, size)} eventHandlers={{ click: () => onSelect(node.id) }} zIndexOffset={selectedId === node.id ? 900 : 0}>
            <Tooltip direction="top" offset={[0, -6]} className="wp-tip">
              {node.name}
              {s ? ` · ${Math.round(s.fit * 100)}% fit` : alt ? " · fallback" : ""}
            </Tooltip>
          </Marker>
        );
      })}

      <SpreadPins waypoints={journey.waypoints} slice={slice} selectedId={selectedId} onSelect={(id) => onSelect(id)} />
    </MapContainer>
  );
}
