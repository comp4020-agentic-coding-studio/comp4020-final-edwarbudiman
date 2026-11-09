# Idea: agent-readiness-fixes

Started 2026-11-09 by the owner.

## Seed

Fix the live agent-readiness scan findings reported by agent-discovery (is-agentic 63/100, isitagentready L3). Owner-approved scope, items 1-3 of .claude/orch/agent-discovery/findings-for-main.md: (1) soft 404s: unknown first path segment that is not a reserved/SPA page and not a username returns 404, with a 'no such board' page and a Markdown 404 body (>=20 chars, links /docs/ and /sitemap.xml) for Accept: text/markdown; channel board URLs must keep working. (2) homepage text without JS: server-render a short about paragraph from docs/agents/about.md plus links to /readme/ and /docs/ in #root or noscript, without changing what logged-in people see. (3) og:image from docs/readme-assets/ and SoftwareApplication JSON-LD via injectHead in server/src/discovery.ts. Light research only for item 1's design, then go fairly straight to a brief. Keep agent-discovery constraints: every new path goes through the route registry (both routes.ts, Vite proxy, reserved usernames) with a spec test; absolute URLs only from PUBLIC_ORIGIN. Merge before agent-discovery brief 2, which also touches discovery.ts.

## Lead notes for research (2026-11-09)

The scans are already done, so don't start from a blank search. Start from these (all in the root checkout):

- `.claude/orch/agent-discovery/findings-for-main.md`: the owner-approved items 1–3 and what is out of scope.
- `.claude/orch/agent-discovery/isitagentready-after-brief1.json`: isitagentready.com, Level 3 of 5 (L1–L3 pass).
- `.claude/orch/agent-discovery/is-agentic-after-brief1.json`: is-agentic.com (Vercel's scanner, built with Ora), 63/100. Public report: https://is-agentic.com/scan/comp4020-final-edwarbudiman.fly.dev. Methodology: https://is-agentic.com/methodology.

What the owner wants from research:

1. Use both scanners as the spec. For each of items 1–3, name the exact check(s) it should flip on each scanner and what full credit needs (status codes, body length, `Vary`, Markdown 404 body, JSON-LD fields, og:image size).
2. Make it robust, not just score-chasing. Use is-agentic's methodology (and isitagentready's docs where they overlap) to find anything the saved JSON marks as failing or partial that items 1–3 could also cover at little cost. For example: 404 for unknown `/.well-known/*` and other extensioned paths, `Vary: Accept` on the 404, canonical/lang on the 404 page, and the false "GraphQL schema reachable" finding. List these as "also worth doing" for the decide step. Don't widen the scope yourself.
3. Item 1's design: how unknown first segments, usernames, channel URLs (`server/src/routes.ts`, `client/src/routes.ts`) and the SPA shell interact, and how to return 404 for a missing user without an extra DB round-trip on every page load being a problem (256 MB, SQLite).
4. You may re-run the scanners only if something changed on fly.dev since the saved JSON. is-agentic publishes a public report per scan, which the owner has already accepted for this domain.

Keep Reddit/HCI light: this is a standards-compliance idea. Say so under the empty sections instead of padding them.
