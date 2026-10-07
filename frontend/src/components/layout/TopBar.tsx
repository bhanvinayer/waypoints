import { useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Menu, Moon, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Waypoints wordmark — clean light editorial style */
function WaypointsWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="w-2.5 h-2.5 rounded-full bg-accent border-2 border-white shadow-sm" />
      <span className="font-mono text-xs font-bold tracking-[0.16em] text-[#151A23] uppercase">
        WAYPOINTS
      </span>
    </div>
  );
}

interface TopBarProps {
  transparent?: boolean;
  mode?: "live" | "demo";
  since?: string;
  journeyId?: string;
  onOpenTrace?: () => void;
}

export function TopBar({ mode, since, journeyId, onOpenTrace }: TopBarProps) {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 h-12 transition-all duration-200",
          "bg-[#F8F7F3] border-b border-[#E5E3DD]"
        )}
      >
        <div className="mx-auto flex h-full max-w-[1600px] items-center gap-0 px-4 md:px-6">

          {/* ── Wordmark ── */}
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 mr-8"
            aria-label="Waypoints"
          >
            <WaypointsWordmark />
          </Link>

          {/* ── Desktop nav ── */}
          <nav className="hidden items-center lg:flex gap-1" aria-label="Main navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  "px-3 h-12 flex items-center text-xs font-semibold tracking-wide transition-colors border-b-2",
                  isActive
                    ? "text-[#151A23] border-accent font-bold"
                    : "text-graphite-600 border-transparent hover:text-[#151A23]"
                )
              }
            >
              Explore
            </NavLink>

            {journeyId && (
              <NavLink
                to={`/route/${journeyId}`}
                className={({ isActive }) =>
                  cn(
                    "px-3 h-12 flex items-center text-xs font-semibold tracking-wide transition-colors border-b-2",
                    isActive
                      ? "text-[#151A23] border-accent font-bold"
                      : "text-graphite-600 border-transparent hover:text-[#151A23]"
                  )
                }
              >
                Route
              </NavLink>
            )}

            {journeyId && (
              <NavLink
                to={`/route/${journeyId}/stress-test`}
                className={({ isActive }) =>
                  cn(
                    "px-3 h-12 flex items-center text-xs font-semibold tracking-wide transition-colors border-b-2",
                    isActive
                      ? "text-[#151A23] border-accent font-bold"
                      : "text-graphite-600 border-transparent hover:text-[#151A23]"
                  )
                }
              >
                Stress Test
              </NavLink>
            )}
          </nav>

          {/* ── Spacer ── */}
          <div className="flex-1" />

          {/* ── Right cluster ── */}
          <div className="hidden items-center gap-4 md:flex">

            {/* Mode indicator */}
            {mode && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface border border-line">
                <span className={cn("h-1.5 w-1.5 rounded-full", mode === "live" ? "bg-ok" : "bg-warn")} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-graphite-600">
                  {mode === "live" ? "Live" : "Demo"}
                </span>
              </div>
            )}

            {since && (
              <span className="text-[10px] text-graphite-500 tnum hidden xl:block">{since}</span>
            )}

            {/* Trace button */}
            {journeyId && onOpenTrace && (
              <button
                onClick={onOpenTrace}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 h-7 rounded-md",
                  "text-[11px] font-semibold text-graphite-700",
                  "border border-line bg-surface hover:bg-[#F0EFEA] transition-colors",
                  "font-mono tracking-wider cursor-pointer"
                )}
              >
                <Activity className="h-3 w-3 text-accent" />
                TRACE
              </button>
            )}

            {/* Sign in link */}
            <Link
              to="/auth"
              className="text-xs font-semibold text-[#151A23] hover:text-accent transition-colors px-2"
            >
              Sign in
            </Link>
          </div>

          {/* ── Mobile menu toggle ── */}
          <button
            className="flex h-9 w-9 items-center justify-center text-[#151A23] transition lg:hidden cursor-pointer"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Spacer */}
      <div className="h-12" />

      {/* ── Mobile nav ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-0 top-12 z-40 bg-[#F8F7F3] border-b border-[#E5E3DD] shadow-md"
          >
            <nav className="mx-auto max-w-[1600px] px-4 py-3 flex flex-col space-y-1">
              <NavLink
                to="/"
                end
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-2 text-xs font-semibold rounded-md",
                    isActive ? "bg-white text-accent font-bold" : "text-[#151A23]"
                  )
                }
              >
                Explore
              </NavLink>

              {journeyId && (
                <>
                  <NavLink
                    to={`/route/${journeyId}`}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "px-3 py-2 text-xs font-semibold rounded-md",
                        isActive ? "bg-white text-accent font-bold" : "text-[#151A23]"
                      )
                    }
                  >
                    Route
                  </NavLink>
                  <NavLink
                    to={`/route/${journeyId}/stress-test`}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "px-3 py-2 text-xs font-semibold rounded-md",
                        isActive ? "bg-white text-accent font-bold" : "text-[#151A23]"
                      )
                    }
                  >
                    Stress Test
                  </NavLink>
                </>
              )}

              <Link
                to="/auth"
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-[#151A23] hover:text-accent"
              >
                Sign in
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
