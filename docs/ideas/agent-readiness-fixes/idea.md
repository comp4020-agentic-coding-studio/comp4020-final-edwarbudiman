# Idea: agent-readiness-fixes

Started 2026-11-09 by the owner.

## Seed

Fix the live agent-readiness scan findings reported by agent-discovery (is-agentic 63/100, isitagentready L3). Owner-approved scope, items 1-3 of .claude/orch/agent-discovery/findings-for-main.md: (1) soft 404s: unknown first path segment that is not a reserved/SPA page and not a username returns 404, with a 'no such board' page and a Markdown 404 body (>=20 chars, links /docs/ and /sitemap.xml) for Accept: text/markdown; channel board URLs must keep working. (2) homepage text without JS: server-render a short about paragraph from docs/agents/about.md plus links to /readme/ and /docs/ in #root or noscript, without changing what logged-in people see. (3) og:image from docs/readme-assets/ and SoftwareApplication JSON-LD via injectHead in server/src/discovery.ts. Light research only for item 1's design, then go fairly straight to a brief. Keep agent-discovery constraints: every new path goes through the route registry (both routes.ts, Vite proxy, reserved usernames) with a spec test; absolute URLs only from PUBLIC_ORIGIN. Merge before agent-discovery brief 2, which also touches discovery.ts.
