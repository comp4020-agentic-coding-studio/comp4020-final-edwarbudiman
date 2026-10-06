#!/usr/bin/env node
// `pnpm dev`: the server (restarting on change) on :8080 and Vite on :5173,
// which proxies the API, WebSocket and /readme/ to it. Open :5173.
import { spawn } from "node:child_process";

const procs = [
  spawn("pnpm", ["dev:server"], { stdio: "inherit" }),
  spawn("pnpm", ["dev:client"], { stdio: "inherit" }),
];
const stop = (): void => {
  for (const p of procs) p.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => code && stop());
