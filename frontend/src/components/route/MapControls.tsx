import { useState } from "react";
import { useMap } from "react-leaflet";
import { Plus, Minus, Locate, Layers, Check } from "lucide-react";
import { MAP_STYLES, type MapStyleKey } from "@/lib/map-styles";
import { cn } from "@/lib/utils";

interface MapStyleSelectorProps {
  currentStyle: MapStyleKey;
  onSelectStyle: (style: MapStyleKey) => void;
  className?: string;
}

export function MapStyleSelector({ currentStyle, onSelectStyle, className }: MapStyleSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative z-[1000]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "bg-white flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#151A23] shadow-sm rounded-[8px] border border-[#E4E2DC]",
          "hover:border-[#F45B22] hover:text-[#F45B22] transition-colors cursor-pointer"
        )}
        title="Change map style mode"
      >
        <Layers className="h-3.5 w-3.5 text-[#F45B22]" />
        <span>{MAP_STYLES[currentStyle]?.name || "Map Style"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-[10px] py-1.5 shadow-lg z-[1001] border border-[#E4E2DC]">
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#667085] border-b border-[#E4E2DC] mb-1">
            Map Style Modes
          </div>
          {(Object.keys(MAP_STYLES) as MapStyleKey[]).map((key) => {
            const style = MAP_STYLES[key];
            const active = currentStyle === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSelectStyle(key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer",
                  active
                    ? "bg-[#FFF4EF] text-[#F45B22] font-bold"
                    : "text-[#151A23] hover:bg-[#FAFAF8]"
                )}
              >
                <div>
                  <div className="font-semibold flex items-center gap-1.5">
                    {style.name}
                    {style.is3D && (
                      <span className="text-[9px] bg-[#FFF4EF] text-[#F45B22] border border-[#F45B22]/30 px-1 py-0.2 rounded font-mono">
                        3D
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#667085] leading-none mt-1">{style.description}</div>
                </div>
                {active && <Check className="h-3.5 w-3.5 text-[#F45B22] shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MapControls({ className }: { className?: string }) {
  const map = useMap();

  return (
    <div className={cn("flex flex-col bg-white border border-[#E4E2DC] rounded-[8px] overflow-hidden shadow-sm", className)}>
      <button
        className="w-8 h-8 grid place-items-center bg-white text-[#151A23] hover:bg-[#F8F7F3] hover:text-[#F45B22] transition-colors cursor-pointer"
        onClick={() => map.zoomIn()}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <div className="h-px bg-[#E4E2DC]" />
      <button
        className="w-8 h-8 grid place-items-center bg-white text-[#151A23] hover:bg-[#F8F7F3] hover:text-[#F45B22] transition-colors cursor-pointer"
        onClick={() => map.zoomOut()}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="h-px bg-[#E4E2DC]" />
      <button
        className="w-8 h-8 grid place-items-center bg-white text-[#151A23] hover:bg-[#F8F7F3] hover:text-[#F45B22] transition-colors cursor-pointer"
        onClick={() => navigator.geolocation.getCurrentPosition((p) => map.flyTo([p.coords.latitude, p.coords.longitude], 13, { duration: 0.6 }))}
        aria-label="Locate me"
        title="Locate me"
      >
        <Locate className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
