/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        // ── Core surfaces (Light Editorial Palette) ───────────────
        canvas: "#F8F7F3",       // warm off-white primary page background
        base: "#FAFAF8",         // secondary light surface
        surface: "#FFFFFF",      // white card & input surface
        panel: "#FFFFFF",        // flat white surface
        muted: "#F3F2EC",        // muted light surface

        // ── Background tokens ─────────────────────────────────────
        bg: {
          DEFAULT: "#F8F7F3",
          100: "#FFFFFF",
          200: "#F0EFEA",
          300: "#E4E2DC",
        },

        // ── Text tokens ───────────────────────────────────────────
        ink: {
          DEFAULT: "#151A23",
          900: "#151A23",
          800: "#2D3440",
          700: "#4B5563",
          600: "#667085",
          500: "#98A2B3",
          400: "#D1D5DB",
          300: "#E4E2DC",
          200: "#F0EFEA",
          100: "#F8F7F3",
        },

        // ── Border lines ───────────────────────────────────────────
        line: {
          DEFAULT: "#E4E2DC",
          light: "#E8E6E0",
          subtle: "#F0EFEA",
        },

        // ── Primary accent: ORANGE (#F45B22) ──────────────────────
        accent: {
          DEFAULT: "#F45B22",
          700: "#D94A18",
          600: "#E0501B",
          500: "#F45B22",
          400: "#F67746",
          300: "#F8966E",
          200: "#FBC4AE",
          100: "#FDE3D8",
          50: "#FFF4EF",
        },

        // ── Semantic ──────────────────────────────────────────────
        ok: {
          DEFAULT: "#168A5B",
          600: "#12724A",
          50: "#E6F4ED",
          100: "#C3E8D5",
        },
        warn: {
          DEFAULT: "#C77A16",
          600: "#A4620F",
          50: "#FEF7EC",
          100: "#FCE7C5",
        },
        bad: {
          DEFAULT: "#C94A4A",
          600: "#A83636",
          50: "#FDF2F2",
          100: "#F8D7D7",
        },

        // ── Map route states ──────────────────────────────────────
        route: {
          primary: "#182235",    // dark navy route line
          selected: "#F45B22",   // active/selected route
          warn: "#C77A16",
          broken: "#C94A4A",
          recovery: "#168A5B",
        },

        // ── Graphite neutrals ─────────────────────────────────────
        graphite: {
          900: "#151A23",
          800: "#2D3440",
          700: "#4B5563",
          600: "#667085",
          500: "#98A2B3",
          400: "#D1D5DB",
          300: "#E4E2DC",
          200: "#98A2B3",
          100: "#667085",
          50: "#F8F7F3",
        },
      },

      fontFamily: {
        display: ['"Author"', '"Geist"', '"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Author"', '"Geist"', '"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', '"JetBrains Mono"', "ui-monospace", "monospace"],
        author: ['"Author"', '"Inter"', "ui-sans-serif", "sans-serif"],
      },

      borderRadius: {
        "sm": "4px",
        DEFAULT: "6px",
        "md": "8px",
        "lg": "10px",
        "xl": "12px",
      },

      boxShadow: {
        panel: "0 2px 10px rgba(20, 25, 35, 0.04)",
        float: "0 4px 16px rgba(20, 25, 35, 0.06)",
        "float-sm": "0 2px 8px rgba(20, 25, 35, 0.04)",
        glow: "0 0 0 3px rgba(244, 91, 34, 0.2)",
        "glow-sm": "0 0 0 2px rgba(244, 91, 34, 0.15)",
        inset: "inset 0 1px 0 rgba(0, 0, 0, 0.04)",
      },

      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pulseAccent: {
          "0%": { boxShadow: "0 0 0 0 rgba(244,91,34,0.4)" },
          "100%": { boxShadow: "0 0 0 10px rgba(244,91,34,0)" },
        },
        sheetUp: { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        sheetDown: { from: { transform: "translateY(0)" }, to: { transform: "translateY(100%)" } },
        sheetIn: { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        sheetOut: { from: { transform: "translateX(0)" }, to: { transform: "translateX(100%)" } },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        fadeOut: { from: { opacity: "1" }, to: { opacity: "0" } },
        slideFade: {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },

      animation: {
        shimmer: "shimmer 1.6s infinite",
        "pulse-accent": "pulseAccent 2s ease-out infinite",
        "sheet-up": "sheetUp .28s cubic-bezier(.22,1,.36,1)",
        "sheet-down": "sheetDown .2s ease-in",
        "sheet-in": "sheetIn .28s cubic-bezier(.22,1,.36,1)",
        "sheet-out": "sheetOut .2s ease-in",
        "fade-in": "fadeIn .15s ease-out",
        "fade-out": "fadeOut .15s ease-in",
        "slide-fade": "slideFade .2s ease-out forwards",
      },
    },
  },
  plugins: [],
};
