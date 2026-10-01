export function fmtClock(minute?: number | null, opts: { short?: boolean } = {}): string {
  if (minute === null || minute === undefined || Number.isNaN(minute)) return "—";
  const m = Math.round(minute);
  const day = Math.floor(m / 1440);
  const mm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60);
  const mi = mm % 60;
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  const base = opts.short && mi === 0 ? `${h12} ${ap}` : `${h12}:${String(mi).padStart(2, "0")} ${ap}`;
  return day > 0 ? `${base} +${day}d` : base;
}

export function fmtDuration(minutes?: number | null): string {
  if (minutes === null || minutes === undefined) return "—";
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mi = m % 60;
  return mi ? `${h}h ${String(mi).padStart(2, "0")}m` : `${h}h`;
}

/** "08:00" <-> minutes */
export function toHHMM(minute: number): string {
  const mm = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
}
export function fromHHMM(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function nextSaturday(from = new Date()): string {
  const d = new Date(from);
  const delta = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function prettyDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return "moments ago";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "moments ago";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
