import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const target = process.env.API_URL ?? "http://localhost:8080";

// The client builds to client/dist, which the server serves. In development
// Vite serves it and passes the API, WebSocket and /readme/ through.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  // three.js (the 3D room) is one chunk of its own, loaded only when 3D opens
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 600 },
  server: {
    // Each feature worktree gets its own pair (scripts/orch/spawn.sh)
    port: Number(process.env.CLIENT_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": { target, changeOrigin: false },
      "/readme": { target, changeOrigin: false },
      "/ws": { target, ws: true, changeOrigin: false },
    },
  },
});
