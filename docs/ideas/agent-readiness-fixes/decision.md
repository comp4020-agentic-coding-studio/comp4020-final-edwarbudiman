# Decision: agent-readiness-fixes

## Picked

Shape B from `research.md`. Unknown paths get the same SPA shell, now with status 404 and server text in `#root`. Missing boards also answer with a Markdown 404. The homepage shell carries `docs/agents/about.md` rendered into `#root`. og:image (`hero.webp`) and `WebApplication` JSON-LD go through `injectHead`.

Along with it, everything the researcher recommended:
1. Markdown and `Vary: Accept` on **every** 404, including `/.well-known/*`, extensioned paths, `/readme/x` and `/docs/x/`.
2. `Vary: Accept` on all 404s.
3. No `canonical` = `/` on non-home shells, which get a self-referential canonical or none.
4. Unknown paths return 404 for any method, so `POST /graphql` gets 404, not 405.
5. 404 for unknown `/c/<slug>`.
6. `/docs/` link in `<noscript>`.
7. Rescan both scanners after each deploy.

**Target:** is-agentic.com score **≥ 90/100** (63 today) with isitagentready.com still at least Level 3. If the items above land under 90, pull in the parts of agent-discovery brief 2 that is-agentic scores:
- `openapi-spec` and `function-calling-compat`: a hand-written `/openapi.json` for the token routes only, with a drift test (as decided in `docs/ideas/agent-discovery/decision.md`).
- `agent-instruction`: `/llms.txt` with a "When to use Post-its" section.

Brief 2 then shrinks by whatever this idea ships.

## Why

The owner's words: "do all recommend, so [the] score will be at least 90, do it until it scores that way". Asked which scanner, they picked "is-agentic ≥ 90, any scope". isitagentready has levels, not a 0–100 score.

Verification is live: the owner chose to **deploy the feature branch to fly.dev each round** and rescan, rather than use a tunnel or scan only after merge. The owner has authorised this in advance for this idea. Each deploy and rescan is done by the lead, never by a worker (standing orders forbid workers deploying):
- `flyctl deploy --remote-only --ha=false -a comp4020-final-edwarbudiman` from the feature worktree;
- forced is-agentic rescan with `GET https://is-agentic.com/api/scan/stream?target=comp4020-final-edwarbudiman.fly.dev` (what `npx is-agentic` calls when no report exists), then `npx is-agentic comp4020-final-edwarbudiman.fly.dev --json`;
- isitagentready through its scan API.

Each scan updates the public report the owner has already accepted for this domain.

## Not picked

- **A** (standalone 404 page): a missing board would leave the app, losing the sidebar and today's in-app "There's no user called x".
- **C** (`<noscript>` only): is-agentic names the empty `#root`, so this risks partial credit on an essential check. It can't reach 90.
- Still out, from `findings-for-main.md`: about/contact/privacy pages (`trust-anchors`, new screens against the thesis), Organization schema with a postal address and contact (`org-schema-completeness`), and DNS-AID, OAuth, A2A, WebMCP, ARD and PAP. Raise them with the owner again only if 90 can't be reached without them.

## It works if

1. `curl -i -H 'Accept: text/markdown' https://…/this-page-does-not-exist-xyz` returns `404`, `Content-Type: text/markdown`, `Vary: Accept`, and a body of at least 20 characters linking `/docs/` and `/sitemap.xml`. The same holds for `/graphql` (GET and POST), `/c/nope-xyz`, `/.well-known/xyz` and `/foo.php`. Spec tests cover each.
2. `/`, `/demo` (an existing user), `/c/lobby`, `/settings`, `/stats`, `/login` and `/u/demo` still return 200 shells. A logged-in user opening `/nosuchuser` sees today's in-app "There's no user called …" view, driven in the app with verify-postits.
3. Raw HTML of `/` (no JS) has an H1, at least 500 characters of text, and links to `/readme/` and `/docs/`. It also has `og:image` (absolute, from `PUBLIC_ORIGIN`) and one `application/ld+json` `WebApplication` block. A logged-in user lands on their board as before.
4. isitagentready.com still reports at least Level 3, with robots, sitemap, Link headers, Markdown negotiation, AI rules and Content-Signal all passing.
5. A fresh is-agentic.com scan of the deployed branch scores **≥ 90**. The JSON goes in `.claude/orch/agent-readiness-fixes/`.

## Spike question

Skip the spike. This is server-side compliance work and the scanners are the judge. The owner will feel two things in the deployed build and judge them at the taste gate:
- on a slow first load of `/`, the about text may flash before the app mounts;
- a logged-out visitor to a missing board now sees "no such board" instead of the login page.

## Open questions

- Is the first-load flash on `/` acceptable? If not, fall back to visually hiding the text until mount, and keep it in `#root` for the scanner.
- If 90 still isn't reached after brief-2's OpenAPI and llms.txt, it's the owner's call whether to add trust-anchor pages or stop.
- Deploying an unmerged branch puts it live on fly.dev, and the next push to `main` (once the repo is public) redeploys `main` over it. Merge soon after it passes.
