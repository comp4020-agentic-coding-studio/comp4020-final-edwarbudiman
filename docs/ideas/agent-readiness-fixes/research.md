# Research: agent-readiness-fixes

## Question

Which scanner checks do items 1–3 (soft 404s, homepage text without JS, og:image + JSON-LD) flip, and what does full credit need? How should the server answer 404 for an unknown first path segment without breaking `/<username>` boards, `/c/<slug>` channels or the SPA, on one 256 MB process with SQLite? This is a standards-compliance idea. It serves the thesis only indirectly: an agent pointed at Post-its should get true answers, and "no such board" should be a real answer.

## What people say

I left this empty on purpose, as the lead notes asked. This is a standards-compliance idea and the scanners are the spec. I did no Reddit or Hacker News search.

## How other apps do it

Not surveyed (light research, per the lead). The relevant "other apps" are the two scanners and the standards they cite. They are below.

### Scanner 1: is-agentic.com (Ora), 63/100, the spec for items 1–3

Saved JSON: `.claude/orch/agent-discovery/is-agentic-after-brief1.json`. Public report and methodology: [report](https://is-agentic.com/scan/comp4020-final-edwarbudiman.fly.dev), [methodology](https://is-agentic.com/methodology).

Scoring, from the methodology: "Essential checks share an 80-point pool and Recommended checks share a 20-point pool", and "partial results receive proportional credit". Bonus is "capped at five points". There are 8 essential checks, so each is worth about 10 points. There are 17 recommended checks, so each is worth about 1.2. Item 1 and item 2 are the two that move the score. Item 3 is worth about 2–3 points.

| Item | is-agentic check (tier, today) | What full credit needs (scanner's own words) | Expected after |
|---|---|---|---|
| 1 | `agent-friendly-404` (essential, **failed**) | "partial credit for a real HTTP 404/410 status and full credit when a Markdown error body is also available … at least 20 characters explaining the error and point agents to your docs, sitemap, or llms.txt … served with Content-Type: text/markdown. A correct status with an HTML error page still earns only partial credit." Its test is `curl -sS -L -i -H 'Accept: text/markdown' <origin>/some-path-that-does-not-exist`, so redirects are followed and the *final* status counts. | pass (+~10) |
| 2 | `content-no-js` (essential, **partial**) | "Serve at least 500 characters of meaningful homepage content in raw HTML. Add a clear H1, keep deeper heading levels sequential". It flagged "8 chars", "`<div id="root">` is empty" and "loads 1 script". Inner pages already pass: "5 of 5 sampled inner pages have text without JavaScript." | pass (+~5) |
| 2 | `public-api-docs` (recommended, **partial**) | "Documentation found at /docs but not linked from homepage". A plain `<a href="/docs/">` in the raw HTML should do it. | pass |
| 3 | `metadata-completeness` (recommended, **partial**, 3/4) | canonical, `<html lang>`, `og:image`, `og:type`. Only `og:image` is missing. The scanner does not state a size or format. | pass |
| 3 | `json-ld` (recommended, **failed**) | "SoftwareApplication for products … with name, description, url, and type-appropriate fields (offers, sameAs, author)". | pass |
| 3 (side effect) | `brand-search-accuracy` (recommended, failed) | "Ora first reads product terms from your homepage's JSON-LD keywords or knowsAbout". Adding `keywords` to the JSON-LD gives it a product term to search with. Ranking is still not ours to fix. | maybe |
| 1 (side effect) | `api-schema-analysis` (partial) and `rate-limit-headers` (failed) | Both rest on "GraphQL: schema reachable (16 types, 2 operations)". Post-its has no GraphQL. See below. | should become N/A |

Checks that items 1–3 will **not** flip, which stay out of scope per `findings-for-main.md`: `openapi-spec`, `function-calling-compat`, `agent-instruction` (all agent-discovery brief 2), `org-schema-completeness` and `trust-anchors` (need contact/address and new /about pages, which are new screens against the thesis), and `agentic-search-specific`.

### Scanner 2: isitagentready.com, Level 3 of 5

Saved JSON: `.claude/orch/agent-discovery/isitagentready-after-brief1.json`. **No isitagentready check covers 404s, homepage text, og:image or JSON-LD.** L4 needs `mcpServerCard`, `a2aAgentCard`, `agentSkills` and `apiCatalog`, which are brief 2 or deliberately skipped. Items 1–3 cannot raise its level. The job is to not regress L1–L3. The checks to protect are `markdownNegotiation` on `/` (an `Accept: text/markdown` GET of `/` must still return the about Markdown), `linkHeaders` on `/` (`alternate` and `describedby`), `robotsTxt` and `sitemap`. Its own probes already see real 404s: every `/.well-known/*` and `/auth.md` request in the JSON got `404 text/plain`.

## What HCI says

Left empty on purpose (standards work). The nearest design guidance is Google's, which is not HCI:

- Google's JavaScript SEO basics has a section titled "Avoid soft 404 errors in single-page apps". It says that with client-side routing "using meaningful HTTP status codes can be impossible or impractical". It offers two fallbacks: a JS redirect to a URL that returns 404, or a JS-added `noindex`. It also says "use a meaningful status code, like a 404 for a page that could not be found" ([source](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)). Post-its has a server that can decide the status itself, so the real-404 route is open to us and is better than either fallback.
- "Google doesn't index URLs that return a 4xx status code" ([source](https://developers.google.com/search/docs/crawling-indexing/http-network-errors)). A missing board should not be indexed anyway.

## What Post-its has today

The live probes ran on 2026-11-09 with `curl` against fly.dev. Nothing has changed since the saved scans: main's last deploy-relevant merge is agent-mcp, which was already live. I did not re-run either scanner.

| Path | Today | Why |
|---|---|---|
| `/this-page-does-not-exist-xyz`, `/graphql`, `/demo`, `/c/lobby`, `/c/nope-xyz`, `/foo/bar` | **200** SPA shell, 1290 B | `serveClient` serves the shell for any extensionless path (`server/src/static.ts`) |
| same, with `Accept: text/markdown` | **200** `text/html` | `negotiate` only handles `/`, `/readme/`, `/docs/**/` |
| `POST /graphql` | **405** JSON "method not allowed" | `dispatch` rejects every non-GET before it knows the path exists (`server/src/index.ts`) |
| `/foo.php`, `/readme/nope` | 404 `text/plain` "not found" (9 B) | extensioned paths in `serveClient`, and `serveReadme` |
| `/.well-known/xyz` | 404 `text/plain` (9 B) | `discovery.ts` `notFound` |
| `/docs/nope` | 301 → `/docs/nope/` → 404 `text/plain` | `serveDocs` |
| `/api/nope` | 404 JSON | API dispatcher |

How routing fits together (the part item 1 has to get right):

- **Server registry** (`server/src/routes.ts`, mirrored in `client/src/routes.ts` and checked by `spec/routes.test.ts`): `SERVER_PAGES` readme and docs, `SERVER_ENDPOINTS` api, ws, healthz and mcp, `SERVER_FILES`, `SERVER_DOT_DIRS` .well-known, and `SPA_PAGES` settings, stats, login and signup. `RESERVED_USERNAMES` in `auth.ts` is built from all of them plus `logout, assets, admin, help, about, new`.
- **Client routes** (`client/src/main.tsx`): `/` is your board. `/c/<slug>` is a channel. `/settings` and `/stats` are app pages. `/<name>` is a user board when `<name>` is not in `PAGES`. `/u/<name>` is an old link, redirected client-side. Anything else gets an in-app "Not found" page. When logged out, every path shows the login page with `next=<path>`.
- **Missing board today:** the client calls `/api/boards/user/<name>`, gets 404 "no such user", and shows "There's no user called “x”." (`Board.tsx` ~l.434). Missing channels get their own `missing` view (~l.1907).
- **Usernames** are `^[a-z0-9_-]{3,20}$`, lower-cased, stored `UNIQUE COLLATE NOCASE` (`db.ts`), so a lookup is an indexed point query. User boards are rows in `boards` with `kind='user'` and the username as slug.
- **Shell head:** `injectHead` adds description, `canonical` = `${ORIGIN}/`, `og:title/description/type/url` to **every** shell response, including `/c/lobby` and `/demo`. The shell is `client/index.html`: `<html lang="en">`, empty `<div id="root">`, and a `<noscript>` that links only `/readme/`.
- **Homepage Markdown already exists:** `docs/agents/about.md` (1019 B, H1 "Post-its", H2 "Read more", links to `/readme/`, `/docs/` and `/sitemap.xml`) is what `Accept: text/markdown` on `/` returns. `marked` is already a server dependency (`static.ts` uses it for `/readme/`).
- **An og:image is already served:** `/readme/docs/readme-assets/hero.webp` returns 200 `image/webp`, 34 KB, 1200×525, through `serveReadme`'s image passthrough. That is an existing route, so the registry does not change. `discovery.webp` is 1200×658.

### Item 1 design: the 404 decision

Put one function in front of `serveClient`'s shell branch. For an extensionless path:

1. `/` → shell (200).
2. `/<SPA_PAGE>` → shell. `/u/<name>` → shell, since the client redirects it.
3. `/c/<slug>` or `/c/<slug>/` → shell, unchanged, so channel URLs keep working. The brief can decide whether unknown slugs also 404; see "also worth doing".
4. `/<name>` or `/<name>/`, where `<name>` matches `USERNAME_RE` after decoding and lower-casing, and `SELECT 1 FROM users WHERE username = ?` finds a row → shell (200).
5. Anything else, including a name that fails `USERNAME_RE`, deeper paths like `/foo/bar`, `/graphql` (7 letters, so it passes the regex but no such user exists) and reserved names that aren't pages (`admin`, `about`) → **404**.

Cost: step 4 is one synchronous `node:sqlite` prepared statement on a UNIQUE index. It only runs for `/<name>` page loads, which are HTML navigations, not API calls, and the client then makes the far heavier `/api/boards/user/<name>` call anyway. No cache is needed, and a cache would go stale on signup. Names that fail `USERNAME_RE` never reach the DB, so probes like `/wp-login.php` and `/.env` cost nothing. Privacy: a 404 does reveal whether a username exists, but the signup "that username is taken" error and the `/api/users` directory already reveal that, so nothing new leaks. A logged-out visitor to a missing board would now see "no such board" instead of the login page. That is better, because logging in would only have led to the same message.

## Shapes

### A. Server-rendered 404 page (plain HTML, no SPA)

The server returns 404 with a small server-rendered "No such board" page in the `/readme/` page's style: `lang="en"`, a title, an H1, one line ("There's no board or page at /x"), and links to `/`, `/readme/` and `/docs/`. It is not the SPA, so no script runs. With `Accept: text/markdown` it sends `text/markdown` 404 with the same text and links to `/docs/`, `/sitemap.xml` and `/index.md`, and `Vary: Accept` on both. Items 2 and 3 are done separately: render `about.md` into `#root` of the shell for `/` only, and add og:image and JSON-LD in `injectHead`.
- **For:** agents and crawlers, and a person who typo'd a username.
- **Evidence:** the full-credit rule above. The Google line that a server status beats JS fallbacks.
- **Cost:** low. One new HTML template in `static.ts` or `discovery.ts`, one guard function, specs.
- **Riskiest assumption:** that the owner is fine with a missing board leaving the app (no sidebar, no cursors). That is a visible change from today's in-app "There's no user called x".

### B. 404 status, same SPA shell, server text in `#root` (recommended)

One mechanism covers items 1 and 2. The server can now put server-rendered text inside `#root` of the shell, and React's `createRoot().render()` replaces it on mount. For `/` it writes `about.md` rendered to HTML: an H1, about 800 characters of text, and links to `/readme/`, `/docs/` and `/sitemap.xml`. That passes `content-no-js` and `public-api-docs`. For an unknown path it sends the **same shell with status 404**, `#root` holding "No such board: there's no user or page called x" plus the same links, and no `canonical` to `/`. The Markdown variant is as in A. Logged-in people still get the app's own "There's no user called x" view with the sidebar, because the client already handles a 404 from the board API. Logged-out people see the server text until the login page mounts. Item 3 (og:image and JSON-LD) goes in `injectHead`, as the seed says.
- **For:** the same people as A, without a jump out of the app.
- **Evidence:** same as A. Also, the client's existing missing-user and missing-channel views mean the in-app experience is already designed, so only the status and the no-JS text are new.
- **Cost:** low. One `fillRoot(html, inner)` helper used twice, the guard function, the Markdown 404, and specs. No new route, so no registry change. The status is the only routing change.
- **Riskiest assumption:** the **flash**. The module script is deferred, so on a slow first load a logged-in person may briefly see the about text (or the 404 text) before React replaces it. Today they see a blank page, then "Loading…". If the owner dislikes it, the fallback is to put the text in `<noscript>` instead. But the scanner does not say whether `<noscript>` text counts toward the 500 characters, and its evidence names the empty `#root` specifically, so that is a gamble on partial credit.

### C. Minimal: 404 status only, everything else unchanged

Return 404 for unknown segments and add the Markdown body. Leave `#root` empty and only extend the `<noscript>` (about text plus a `/docs/` link). Add og:image and JSON-LD.
- **For:** the smallest diff before agent-discovery brief 2.
- **Evidence:** it flips `agent-friendly-404` for sure. Whether `content-no-js` flips depends on how the scanner treats `<noscript>`, which it does not document.
- **Cost:** lowest.
- **Riskiest assumption:** that `<noscript>` content counts for `content-no-js`. If it doesn't, the essential check stays partial (about 5 points left on the table).

### Item 3 details (the same in every shape)

- `og:image` = `${ORIGIN}/readme/docs/readme-assets/hero.webp`, an absolute URL from `PUBLIC_ORIGIN` on an existing route, plus `og:image:width` 1200, `og:image:height` 525, `og:image:type` image/webp and `og:image:alt`. ogp.me: "If the page specifies an og:image it should specify og:image:alt" ([ogp.me](https://ogp.me/)). Caveat: Facebook recommends "at least 1200 x 630 pixels" and "close to 1.91:1" and doesn't mention WebP ([Facebook](https://developers.facebook.com/docs/sharing/webmasters/images/)). hero.webp is 2.29:1. The scanner only checks that the tag is present, so this passes. A 1200×630 PNG for link previews is a follow-up, not needed for the check.
- JSON-LD: one `<script type="application/ld+json">` with `@type: "WebApplication"`, which is a subtype of SoftwareApplication ([schema.org](https://schema.org/WebApplication)) and is supported by Google ([Google](https://developers.google.com/search/docs/appearance/structured-data/software-app)). It needs `name`, `description` (the same string as the meta description), `url` (`${ORIGIN}/`), `image`, `applicationCategory`, `operatingSystem: "Any"`, `browserRequirements: "Requires JavaScript"`, `offers: {price: "0"}`, and `keywords` (for Ora's brand-search check), plus `sameAs` the GitHub repo if it is public. Do **not** invent `aggregateRating` or `review`. Google needs one of them for a rich result, but there are no real reviews, and is-agentic only asks for name, description and url. The CSP does not block a non-executing `ld+json` block. Put it on the `/` shell only, or on every shell. The brief should pick one, and `/` only is simpler and matches "homepage".

## Also worth doing (for the decide step; not added to scope)

1. **Markdown negotiation on every 404, not just the new one.** Today `/.well-known/x`, `/foo.php`, `/readme/x` and `/docs/x/` return 9-byte `text/plain`. The scanner's probe path is undocumented, so if it ever picks an extensioned path we lose full credit again. `notFound` and the two inline 404s in `static.ts` could share the new 404 responder. Cheap.
2. **`Vary: Accept` on 404s.** The 404 changes with `Accept`, so per RFC 9110 the response must say so ("describes what parts of a request message … might have influenced … the content of this response", [RFC 9110 §12.5.5](https://www.rfc-editor.org/rfc/rfc9110#name-vary)). One header.
3. **No `canonical: /` on non-home shells.** `injectHead` stamps `canonical` = `/` on `/c/lobby`, `/demo` and so on, which tells crawlers every board *is* the homepage. It must at least go from the 404 page. Dropping it from all non-`/` shells (or making it self-referential) is a one-line change.
4. **The false GraphQL finding.** Item 1 makes `GET /graphql` a 404. But `POST /graphql` currently returns 405 "method not allowed", because `dispatch` refuses non-GET before checking the path. An unknown path should be 404 for any method. That is cheap: run the 404 guard before the 405. Note that the "16 types, 2 operations" in the scan is **unexplained**. Neither endpoint returns anything parseable as a schema, so a post-deploy rescan should confirm the finding is gone.
5. **Unknown channel slugs.** `/c/nope` is still a 200 shell under shape B. A 404 needs `SELECT 1 FROM boards WHERE kind='channel' AND slug=?`, the same cost as users. It doesn't leak private channels any more than the API's 403-vs-404 already does. Owner's call.
6. **`<noscript>` currently links only `/readme/`.** Add `/docs/` either way.
7. **Rescan after deploy.** Both scanners, to confirm no L1–L3 regression on isitagentready and the expected is-agentic gain (63 → about 80). The owner has already accepted public is-agentic reports for this domain.

## Recommendation

Shape B. It flips both essential checks for sure (real 404 with a Markdown body, and 500+ characters in `#root`, which is what the scanner names) with one small mechanism and no new route. Logged-in people keep today's in-app "no such user" view. Take also-worth-doing 1–4 with it, since each is a line or two and makes the 404 robust instead of tuned to one probe path. The spike should show the owner the first-load flash on `/` and the logged-out 404 text.

## Sources

- https://is-agentic.com/methodology
- https://is-agentic.com/scan/comp4020-final-edwarbudiman.fly.dev
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/http-network-errors
- https://developers.google.com/search/docs/appearance/structured-data/software-app
- https://schema.org/WebApplication
- https://ogp.me/
- https://developers.facebook.com/docs/sharing/webmasters/images/
- https://www.rfc-editor.org/rfc/rfc9110#name-vary
- `.claude/orch/agent-discovery/findings-for-main.md` (root)
- `.claude/orch/agent-discovery/is-agentic-after-brief1.json` (root)
- `.claude/orch/agent-discovery/isitagentready-after-brief1.json` (root)
- Live `curl` probes of https://comp4020-final-edwarbudiman.fly.dev, 2026-11-09
- Code: `server/src/{index,routes,discovery,static,auth,boards,db}.ts`, `client/src/{main.tsx,routes.ts,pages/Board.tsx}`, `client/index.html`, `docs/agents/about.md`, `spec/routes.test.ts`
