/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        sand: { DEFAULT: "#FAF7F2", 100: "#F4EFE6", 200: "#ECE5D8", 300: "#E0D7C6" },
        ink: { DEFAULT: "#10211D", 700: "#26413A", 600: "#3B5750", 500: "#5B6F69", 400: "#8A9B96", 300: "#B6C1BD" },
        line: "#E7E0D3",
        accent: { DEFAULT: "#E8501C", 600: "#CF4414", 50: "#FFF1EA", 100: "#FFE0D3", 200: "#FFC5AD" },
        ok: { DEFAULT: "#1E9E6A", 50: "#E8F7F0", 100: "#CDEEDD" },
        warn: { DEFAULT: "#D99A00", 50: "#FFF6DB", 100: "#FDEAB0" },
        bad: { DEFAULT: "#D3402F", 50: "#FDECEA", 100: "#F9CFCA" },
        night: "#0C1B17",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { "4xl": "2rem" },
      boxShadow: {
        card: "0 1px 0 rgba(16,33,29,0.04), 0 8px 24px -12px rgba(16,33,29,0.18)",
        float: "0 12px 40px -12px rgba(16,33,29,0.35)",
        glow: "0 0 0 6px rgba(232,80,28,0.14)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgba(232,80,28,0.45)" }, "100%": { boxShadow: "0 0 0 14px rgba(232,80,28,0)" } },
        sheetUp: { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        sheetDown: { from: { transform: "translateY(0)" }, to: { transform: "translateY(100%)" } },
        sheetIn: { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        sheetOut: { from: { transform: "translateX(0)" }, to: { transform: "translateX(100%)" } },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        fadeOut: { from: { opacity: "1" }, to: { opacity: "0" } },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        floaty: "floaty 6s ease-in-out infinite",
        pulseRing: "pulseRing 1.8s ease-out infinite",
        "sheet-up": "sheetUp .32s cubic-bezier(.22,1,.36,1)",
        "sheet-down": "sheetDown .22s ease-in",
        "sheet-in": "sheetIn .32s cubic-bezier(.22,1,.36,1)",
        "sheet-out": "sheetOut .22s ease-in",
        "fade-in": "fadeIn .2s ease-out",
        "fade-out": "fadeOut .2s ease-in",
      },
    },
  },
  plugins: [],
};
