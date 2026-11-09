// Adding a top-level route (the one place the server's side of it lives)
//
// A top-level path like /docs is named in four places that must agree:
//   1. here (SERVER_PAGES / SERVER_ENDPOINTS), which index.ts dispatches from
//   2. client/src/routes.ts, the same lists for the browser (the Dockerfile
//      builds the client without server/, so the client can't import this file;
//      spec/routes.test.ts fails if the two copies differ)
//   3. the Vite dev proxy in client/vite.config.ts (built from the client copy,
//      with anchored keys so a username like /docs-x stays a board)
//   4. RESERVED_USERNAMES in auth.ts (built from both lists, plus the app pages)
// To add one: add the name to both routes.ts files, add a dispatch line in
// index.ts, run `pnpm check`. spec/routes.test.ts says what you forgot.

/** Pages the server renders itself (not the SPA). */
export const SERVER_PAGES = ["readme", "docs"] as const;

/** Non-page paths the server owns: the API, the WebSocket and the health check. */
export const SERVER_ENDPOINTS = ["api", "ws", "healthz"] as const;

/** App pages the SPA serves at the top level, next to users' boards. */
export const SPA_PAGES = ["settings", "stats", "login", "signup"] as const;

/** `path` is `/name` or under `/name/`, never `/name-x` or `/namex`. */
export const underPrefix = (path: string, name: string): boolean => path === `/${name}` || path.startsWith(`/${name}/`);
