export type MapStyleKey = "positron" | "bright" | "liberty" | "dark" | "fiord" | "3d";

export interface MapStyleConfig {
  key: MapStyleKey;
  name: string;
  description: string;
  url: string;
  attribution: string;
  subdomains?: string;
  maxZoom: number;
  is3D?: boolean;
  filterClass?: string;
}

export const MAP_STYLES: Record<MapStyleKey, MapStyleConfig> = {
  positron: {
    key: "positron",
    name: "Positron",
    description: "Clean light cartographic canvas",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; Esri, DeLorme, NAVTEQ',
    subdomains: "abc",
    maxZoom: 19,
  },
  bright: {
    key: "bright",
    name: "Bright",
    description: "Vibrant high-contrast street map",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; Esri, USGS, NOAA',
    subdomains: "abc",
    maxZoom: 19,
  },
  liberty: {
    key: "liberty",
    name: "Liberty",
    description: "Standard OpenMapTiles vector layout",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    subdomains: "abc",
    maxZoom: 19,
  },
  dark: {
    key: "dark",
    name: "Dark",
    description: "Monochrome dark tactical view",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; Esri, DeLorme, NAVTEQ',
    subdomains: "abc",
    maxZoom: 19,
  },
  fiord: {
    key: "fiord",
    name: "Fiord",
    description: "Cool blue/slate topographic theme",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; Esri, HERE, Garmin',
    subdomains: "abc",
    maxZoom: 19,
  },
  "3d": {
    key: "3d",
    name: "3D View",
    description: "Satellite terrain with 3D tilt perspective",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP",
    subdomains: "abc",
    maxZoom: 19,
    is3D: true,
  },
};

export const DEFAULT_MAP_STYLE: MapStyleKey = "positron";

export function getSafeMapStyle(key?: string | null): MapStyleConfig {
  const style = (key && key in MAP_STYLES) ? MAP_STYLES[key as MapStyleKey] : MAP_STYLES[DEFAULT_MAP_STYLE];
  return {
    ...style,
    subdomains: style.subdomains || "abc",
  };
}
