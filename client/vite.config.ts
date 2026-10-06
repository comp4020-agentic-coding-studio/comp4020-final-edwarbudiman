import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const target = process.env.API_URL ?? "http://localhost:8080";

// The client builds to client/dist, which the server serves. In development
// Vite serves it and passes the API, WebSocket and /readme/ through.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": { target, changeOrigin: false },
      "/readme": { target, changeOrigin: false },
      "/ws": { target, ws: true, changeOrigin: false },
    },
  },
});
