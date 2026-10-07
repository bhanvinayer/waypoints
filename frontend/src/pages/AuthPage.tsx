import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Wordmark — inline, same motif as TopBar ───────────────────────────────────
function AuthWordmark() {
  return (
    <div className="flex flex-col items-center gap-3 mb-8">
      {/* Journey thread SVG */}
      <svg
        viewBox="0 0 72 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-[5rem]"
        aria-hidden
      >
        <line x1="2" y1="8" x2="70" y2="8" stroke="#2A2A2A" strokeWidth="1" />
        <circle cx="2" cy="8" r="2.5" fill="#FFFFFF" />
        <circle cx="24" cy="8" r="3" fill="#111111" stroke="#383838" strokeWidth="1.5" />
        <circle cx="24" cy="8" r="1.5" fill="#E8651A" />
        <circle cx="48" cy="8" r="3" fill="#111111" stroke="#383838" strokeWidth="1.5" />
        <circle cx="48" cy="8" r="1.5" fill="#707070" />
        <circle cx="70" cy="8" r="2.5" fill="#E8651A" />
      </svg>
      {/* Text wordmark */}
      <span className="font-mono text-[11px] font-bold tracking-[0.22em] text-white uppercase">
        WAYPOINTS
      </span>
      <p className="text-graphite-200 text-[12px] tracking-wide">
        Temporal Route Intelligence
      </p>
    </div>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

function Field({ label, id, ...props }: InputProps & { id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[11px] font-semibold tracking-[0.1em] uppercase text-graphite-100"
      >
        {label}
      </label>
      <input
        id={id}
        className={cn(
          "bg-[#111111] border border-[#2A2A2A] text-white text-[15px]",
          "px-3 py-2.5 w-full",
          "focus:outline-none focus:border-accent transition-colors",
          "placeholder:text-graphite-300"
        )}
        {...props}
      />
    </div>
  );
}

// ── Toast / inline message ────────────────────────────────────────────────────
function DemoNotice({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "border border-[#2A2A2A] bg-[#111111]",
            "px-3 py-2.5 text-[13px] text-graphite-100 leading-snug"
          )}
          role="status"
          aria-live="polite"
        >
          <span className="text-accent font-semibold">Note — </span>
          This is a demo — authentication is not implemented. Explore the app freely.
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Tab = "signin" | "signup";

export default function AuthPage() {
  const [tab, setTab] = useState<Tab>("signin");
  const [submitted, setSubmitted] = useState(false);

  // Sign-in fields
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");

  // Sign-up fields
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  // Reset notice when switching tabs
  function switchTab(next: Tab) {
    setTab(next);
    setSubmitted(false);
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <TopBar />

      <main className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">

          {/* ── Wordmark ── */}
          <AuthWordmark />

          {/* ── Panel ── */}
          <div className="border border-[#2A2A2A] bg-[#0B0B0B]">

            {/* ── Tab bar ── */}
            <div className="flex border-b border-[#2A2A2A]">
              {(["signin", "signup"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={cn(
                    "flex-1 py-3 text-[12px] font-semibold tracking-[0.08em] uppercase transition-colors",
                    "relative",
                    tab === t
                      ? "text-white"
                      : "text-graphite-200 hover:text-graphite-100"
                  )}
                >
                  {t === "signin" ? "Sign In" : "Sign Up"}
                  {tab === t && (
                    <motion.div
                      layoutId="auth-tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"
                      transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* ── Form area ── */}
            <div className="px-6 py-7">
              <DemoNotice visible={submitted} />

              <AnimatePresence mode="wait" initial={false}>
                {tab === "signin" ? (
                  <motion.form
                    key="signin"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.18 }}
                    onSubmit={handleSubmit}
                    noValidate
                    className="flex flex-col gap-4 mt-4"
                  >
                    <Field
                      id="si-email"
                      label="Email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={siEmail}
                      onChange={(e) => setSiEmail(e.target.value)}
                    />
                    <Field
                      id="si-password"
                      label="Password"
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      value={siPassword}
                      onChange={(e) => setSiPassword(e.target.value)}
                    />
                    <Button
                      type="submit"
                      variant="accent"
                      size="lg"
                      className="mt-2 w-full"
                    >
                      Sign in
                    </Button>
                  </motion.form>
                ) : (
                  <motion.form
                    key="signup"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18 }}
                    onSubmit={handleSubmit}
                    noValidate
                    className="flex flex-col gap-4 mt-4"
                  >
                    <Field
                      id="su-name"
                      label="Name"
                      type="text"
                      placeholder="Your name"
                      autoComplete="name"
                      value={suName}
                      onChange={(e) => setSuName(e.target.value)}
                    />
                    <Field
                      id="su-email"
                      label="Email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={suEmail}
                      onChange={(e) => setSuEmail(e.target.value)}
                    />
                    <Field
                      id="su-password"
                      label="Password"
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      value={suPassword}
                      onChange={(e) => setSuPassword(e.target.value)}
                    />
                    <Field
                      id="su-confirm"
                      label="Confirm Password"
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      value={suConfirm}
                      onChange={(e) => setSuConfirm(e.target.value)}
                    />
                    <Button
                      type="submit"
                      variant="accent"
                      size="lg"
                      className="mt-2 w-full"
                    >
                      Create account
                    </Button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Demo note ── */}
          <p className="mt-4 text-center text-[12px] text-graphite-200 border border-[#2A2A2A] px-4 py-2.5 bg-[#0B0B0B]">
            No account needed — the full app works without signing in.
          </p>
        </div>
      </main>
    </div>
  );
}
