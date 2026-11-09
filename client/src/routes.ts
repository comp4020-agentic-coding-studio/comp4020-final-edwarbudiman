// Adding a top-level route (the browser's side; see server/src/routes.ts)
//
// Keep these lists equal to the ones in server/src/routes.ts. The client builds
// without server/ in the Dockerfile, so it can't import them; spec/routes.test.ts
// fails if they drift. main.tsx and vite.config.ts are built from this file.

/** Pages the server renders itself: the SPA loads them as real pages. */
export const SERVER_PAGES = ["readme", "docs"] as const;

/** Non-page paths the server owns: the API, the WebSocket and the health check. */
export const SERVER_ENDPOINTS = ["api", "ws", "healthz"] as const;

/** App pages the SPA serves at the top level, next to users' boards. */
export const SPA_PAGES = ["settings", "stats", "login", "signup"] as const;

/** Vite proxy key for a server path: anchored so /docs-x and /readmex stay boards. */
export const proxyKey = (name: string): string => `^/${name}(/|$)`;
