import { resolve } from "node:path";

// Everything the server reads from the environment, in one place.
export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  // Fly mounts the volume at /data (the Dockerfile sets DATA_DIR=/data);
  // locally the database sits in ./data, which is gitignored.
  dataDir: resolve(process.env.DATA_DIR ?? "./data"),
  // Repo root: README.md and the images it links live here.
  rootDir: resolve(process.env.APP_ROOT ?? "."),
  clientDir: resolve(process.env.CLIENT_DIR ?? "./client/dist"),
  // Documented in README.md: the way in for markers and demos.
  demoPassword: process.env.DEMO_PASSWORD ?? "postit-demo",
  sessionDays: 30,
  // Fly terminates TLS in front of the app, so "secure" is read from the
  // forwarded protocol; COOKIE_SECURE=1 forces it.
  forceSecureCookie: process.env.COOKIE_SECURE === "1",
  signupsPerHourPerIp: Number(process.env.SIGNUP_LIMIT_PER_HOUR ?? 200),
};
