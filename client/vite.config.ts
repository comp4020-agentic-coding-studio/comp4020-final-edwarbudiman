import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { SERVER_ENDPOINTS, SERVER_PAGES, proxyKey } from "./src/routes.ts";

const target = process.env.API_URL ?? "http://localhost:8080";

// The client builds to client/dist, which the server serves. In development
// Vite serves it and passes the API, WebSocket and /readme/ and /docs/ through.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  // three.js (the 3D room) is one chunk of its own, loaded only when 3D opens
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 600 },
  server: {
    // Each feature worktree gets its own pair (scripts/orch/spawn.sh)
    port: Number(process.env.CLIENT_PORT ?? 5173),
    strictPort: true,
    proxy: Object.fromEntries(
      // every server-owned top-level path, anchored (see src/routes.ts)
      [...SERVER_ENDPOINTS, ...SERVER_PAGES]
        .map((name) => [proxyKey(name), { target, changeOrigin: false, ws: name === "ws" }]),
    ),
  },
});
