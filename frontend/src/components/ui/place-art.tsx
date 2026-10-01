import { useId } from "react";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const PALETTE: Record<string, [string, string, string]> = {
  heritage: ["#FFD9B8", "#F4A27A", "#B5482A"],
  museum: ["#E3DDF5", "#B8A9E6", "#5B4A9E"],
  meal: ["#FFE8A8", "#FFB65C", "#C2571B"],
  snack: ["#FFE0E6", "#FFA8B8", "#B83B5A"],
  viewpoint: ["#FFC9A3", "#F27B6A", "#5A3A6E"],
  nature: ["#D6F0DC", "#8ED1A0", "#2C7A4B"],
  market: ["#FFE7B8", "#F7B24A", "#A8431A"],
  event: ["#D9D6F7", "#7F78E0", "#2B2670"],
  nightlife: ["#2A2150", "#5A3E9B", "#F0B8FF"],
  religious: ["#FFE9C9", "#F2C27A", "#9B5A1A"],
  activity: ["#CFEFEA", "#6FCFC0", "#15776B"],
  other: ["#E8E3D8", "#C8C0AE", "#6C6553"],
};

export function PlaceArt({ role, seed, className, name }: { role: Role | string; seed: string; className?: string; name?: string }) {
  const id = useId().replace(/:/g, "");
  const [c1, c2, c3] = PALETTE[role] ?? PALETTE.other;
  const h = hash(seed);
  const sunX = 70 + (h % 180);
  const flip = h % 2 === 0;

  const scenes: Record<string, JSX.Element> = {
    heritage: (
      <g>
        <circle cx={sunX} cy="62" r="26" fill="#fff" opacity=".55" />
        <path d="M0 200V140h40v-22h14v22h26v-30h14v30h30v-48l14-14 14 14v48h30v-26h14v26h26v-34h14v34h30v-18h14v18h54v60z" fill={c3} opacity=".9" />
        <path d="M120 200v-48a22 22 0 0 1 44 0v48z" fill={c1} />
        <path d="M24 200v-26a12 12 0 0 1 24 0v26zM232 200v-26a12 12 0 0 1 24 0v26z" fill={c1} opacity=".85" />
        <path d="M0 200h320v-12H0z" fill={c3} />
      </g>
    ),
    museum: (
      <g>
        <path d="M40 150h240l-120-56z" fill={c3} />
        <rect x="52" y="150" width="216" height="10" fill={c3} />
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={72 + i * 40} y="104" width="16" height="46" rx="3" fill="#fff" opacity=".85" />)}
        <rect x="40" y="160" width="240" height="40" fill={c3} opacity=".9" />
      </g>
    ),
    meal: (
      <g>
        <ellipse cx="160" cy="132" rx="92" ry="34" fill="#fff" opacity=".9" />
        <ellipse cx="160" cy="128" rx="74" ry="26" fill={c1} />
        <circle cx="140" cy="124" r="10" fill={c3} opacity=".85" /><circle cx="170" cy="130" r="12" fill="#E1593A" opacity=".85" /><circle cx="186" cy="118" r="8" fill="#5EA55B" />
        {[0, 1, 2].map((i) => <path key={i} d={`M${130 + i * 30} 88c-10-12 10-18 0-30`} stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".7" />)}
      </g>
    ),
    snack: (
      <g>
        <path d="M110 96h100v34a50 50 0 0 1-100 0z" fill="#fff" />
        <path d="M210 108h18a18 18 0 0 1 0 36h-22" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M120 104h80v24a40 40 0 0 1-80 0z" fill={c3} opacity=".85" />
        {[0, 1].map((i) => <path key={i} d={`M${142 + i * 26} 84c-9-10 9-16 0-26`} stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".8" />)}
        <ellipse cx="160" cy="184" rx="86" ry="12" fill={c3} opacity=".35" />
      </g>
    ),
    viewpoint: (
      <g>
        <circle cx={sunX} cy="96" r="38" fill="#FFF3D6" />
        <circle cx={sunX} cy="96" r="58" fill="#fff" opacity=".18" />
        <path d="M0 200V150c40-34 70-30 110-6 40-34 80-48 120-14 30 8 60 20 90 36v34z" fill={c3} opacity=".75" />
        <path d="M0 200v-26c60-20 120-10 180 0s100-8 140-18v44z" fill={c3} />
      </g>
    ),
    nature: (
      <g>
        <circle cx={flip ? 250 : 70} cy="52" r="22" fill="#fff" opacity=".7" />
        <path d="M0 150c60-50 110-50 170-10 50-30 100-30 150 6v54H0z" fill={c3} opacity=".55" />
        <path d="M0 176c80-20 160-20 320 0v24H0z" fill="#6FB6D6" opacity=".8" />
        {[40, 90, 250, 280].map((x, i) => <path key={x} d={`M${x} 150l${10 + i}-${40 + i * 4} ${10 + i} ${40 + i * 4}z`} fill={c3} />)}
      </g>
    ),
    market: (
      <g>
        {Array.from({ length: 8 }).map((_, i) => <path key={i} d={`M${i * 40} 70h40l-6 34a20 20 0 0 1-40 0z`} fill={i % 2 ? "#fff" : c3} opacity=".95" />)}
        {[60, 140, 220].map((x, i) => <g key={x}><circle cx={x} cy={150} r={22 - i * 2} fill={[c3, c1, "#fff"][i]} /><rect x={x - 28} y={166} width={56} height={34} rx="6" fill={c2} opacity=".7" /></g>)}
      </g>
    ),
    event: (
      <g>
        <path d="M120 0h80l60 200H60z" fill="#fff" opacity=".18" />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={86 + i * 40} y={150 - ((h >> i) % 5) * 12} width="22" rx="11" height="60" fill="#fff" opacity=".85" />)}
        <circle cx="262" cy="52" r="6" fill="#fff" opacity=".8" /><circle cx="52" cy="70" r="4" fill="#fff" opacity=".6" />
      </g>
    ),
    nightlife: (
      <g>
        <circle cx={sunX} cy="56" r="26" fill="#FFF3D6" /><circle cx={sunX + 12} cy="50" r="24" fill={c1} />
        <path d="M110 180l22-70h56l22 70z" fill="#fff" opacity=".85" /><rect x="154" y="180" width="12" height="20" fill="#fff" opacity=".85" />
        {[40, 90, 260].map((x) => <circle key={x} cx={x} cy={90 + (x % 40)} r="3" fill="#fff" opacity=".8" />)}
      </g>
    ),
    religious: (
      <g>
        <circle cx={sunX} cy="58" r="22" fill="#fff" opacity=".6" />
        <path d="M110 200v-70a50 50 0 0 1 100 0v70z" fill={c3} />
        <path d="M160 70v-26" stroke={c3} strokeWidth="5" /><path d="M160 46l24 8-24 8z" fill="#E8501C" />
        <rect x="70" y="140" width="24" height="60" fill={c3} opacity=".85" /><rect x="226" y="140" width="24" height="60" fill={c3} opacity=".85" />
      </g>
    ),
    activity: (
      <g>
        <circle cx="160" cy="112" r="64" fill="none" stroke="#fff" strokeWidth="7" opacity=".9" />
        <circle cx="160" cy="112" r="6" fill="#fff" />
        {Array.from({ length: 8 }).map((_, i) => { const a = (i / 8) * Math.PI * 2; return <g key={i}><path d={`M160 112L${160 + Math.cos(a) * 64} ${112 + Math.sin(a) * 64}`} stroke="#fff" strokeWidth="3" opacity=".8" /><circle cx={160 + Math.cos(a) * 64} cy={112 + Math.sin(a) * 64} r="8" fill={i % 2 ? c3 : "#fff"} /></g>; })}
        <path d="M140 200l20-88 20 88" stroke="#fff" strokeWidth="6" fill="none" />
      </g>
    ),
  };

  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" className={cn("h-full w-full", className)} role="img" aria-label={name ? `Illustration for ${name}` : "Place illustration"}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#g${id})`} />
      {scenes[role] ?? (
        <g>
          <circle cx={sunX} cy="70" r="30" fill="#fff" opacity=".6" />
          <path d="M0 200V150c60-30 120-30 180-4s100 4 140-10v64z" fill={c3} opacity=".7" />
        </g>
      )}
    </svg>
  );
}
