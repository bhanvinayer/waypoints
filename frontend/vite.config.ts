import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Frontend -> FastAPI. The browser never talks to SerpApi; /api is proxied to the backend.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
