import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="64" height="64" rx="18" fill="#171918" />
      <path d="M12 45 C 24 45, 22 21, 34 23 S 46 39, 52 18" fill="none" stroke="#F7F8F5" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 8" />
      <circle cx="12" cy="45" r="5" fill="#F7F8F5" />
      <circle cx="34" cy="23" r="4" fill="#5C9E31" opacity=".65" />
      <circle cx="52" cy="18" r="6.5" fill="#5C9E31" />
    </svg>
  );
}

export function Wordmark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("font-display text-[19px] font-extrabold tracking-[0.06em]", light ? "text-white" : "text-ink")}>WAYPOINTS</span>
    </span>
  );
}
