# Research: agent-discovery

## Question

How should a user's own agent find out what Post-its is, read its public pages and reach the token and MCP surface from agent-mcp, without adding a screen, a service or anything that breaks "you open it and you're on your board"? And which of the checklist items in backlog checkpoint G are actually used by agents, and which only exist to raise a scanner score?

## What people say

**llms.txt is mostly not read by crawlers. It is read by coding agents that a user points at a site.**

- "What we've observed is that this file is never requested by any LLMs … At most, it was requested by bots from BuiltWith and WebPageTest, but not by major LLMs." (reconnecting, [HN 46058273](https://news.ycombinator.com/item?id=46058273))
- The author of the proposal says it was always for inference-time use: "llms.txt isn't really designed to help with scraping; it's designed to help end-users use the information on web sites with the help of AI" (jph00, [HN 41439983](https://news.ycombinator.com/item?id=41439983))
- Critics in the same thread: "Instead of munging URLs to get alternate formats, this is what content negotiation or rel=alternate were designed for." (JimDabell). Others don't want to help LLMs at all: "I'm uninterested in making it easier for LLM products to interact with my sites." (haswell, [same thread](https://news.ycombinator.com/item?id=41439983))
- The claims of SEO gains come from vendors: "I work at Mintlify … can attest to the boost in SEO/GEO traffic" (skeptrune). Against that: "I asked ChatGPT if they care and the answer was No." (codegeek, [HN 44759462](https://news.ycombinator.com/item?id=44759462))

**Markdown negotiation is used, almost entirely by coding agents.**

- Evil Martians measured six months of logs: "Claude Code accounts for 94% of all Markdown traffic." "`ChatGPT-User` … asked for Markdown on under 1% of its requests", and "`llms.txt`, April's top pick, is still read by almost no AI tool." They rank SSR HTML, `.md` routes and `Accept: text/markdown` as critical, `rel=alternate`/`Link` as medium, and llms.txt as low ([Evil Martians](https://evilmartians.com/chronicles/how-to-make-your-website-visible-to-llms)).
- Over 44 days one site logged 1,421 requests asking for Markdown. "Claude's infrastructure (not ClaudeBot, something else) is a major consumer. 500 requests is 35% of all traffic." One how-to page about an MCP server got 32% of all requests ([Suganthan](https://suganthan.com/blog/cloudflare-markdown-for-agents/)). The pages agents fetch are the ones that explain how to connect to something.

**Teams that chase a scanner score end up shipping placeholders.**

- ant-design added about ten `.well-known` files in one PR to raise its isitagentready.com score from "Level 0 - Not Ready with only 1/15 checks passing". Review bots then flagged a placeholder Web Bot Auth key ("Replace placeholder JWK with a valid Ed25519 public key"), a WebMCP tool that never registers, and robots.txt groups that hide the `Content-Signal` line from AI bots ([ant-design#57903](https://github.com/ant-design/ant-design/pull/57903)). The backlog already says the same thing: "not as a target to game".
- API catalogs are rare: "Four out of seventy-four." Most providers instead send a 200 with their app's HTML, and "an HTML 200 at a well-known path lies." ([API Evangelist](https://apievangelist.com/blog/2026/05/22/four-providers-publishing-well-known-api-catalog/))

**Reddit:** searches with `site:reddit.com` (llms.txt, AI crawlers, r/selfhosted) found no threads. The only Reddit voice is Google's John Mueller, quoted second-hand by Ahrefs comparing llms.txt to the keywords meta tag. I didn't open that page, so it isn't cited as a source.

## How other apps do it

- **Notion**: remote MCP at `mcp.notion.com/mcp`, a `/.well-known/mcp.json` discovery file, and developer docs that each point at `/llms.txt` (from search results on Notion's developer docs; pattern only, not quoted).
- **Miro**: publishes `developers.miro.com/llms.txt` and an MCP docs page (search results).
- **isitagentready.com and is-agentic.com practise what they check.** Each serves `/llms.txt`, an api-catalog, an MCP endpoint and a server card, and is-agentic.com also serves `/openapi.json` and `/sitemap.xml` ([isitagentready llms-full.txt](https://isitagentready.com/llms-full.txt), [is-agentic.com](https://is-agentic.com/)). The common pattern is one small set of pointers on the domain that leads to the API docs and the MCP URL.
- **Cloudflare Markdown for Agents** converts at the edge: an `Accept: text/markdown` request gets `Content-Type: text/markdown; charset=utf-8` with `Vary: Accept`, and the body is front matter followed by Markdown ([Cloudflare docs](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)). Post-its isn't behind Cloudflare, so it would do the same in `server/src`.

## What the scanners check

**isitagentready.com** (Cloudflare) runs 23 checks and gives a level from 0 to 5 ([llms-full.txt](https://isitagentready.com/llms-full.txt)):

- **L1:** pass 2 of 3: robots.txt (200, text/plain, a `User-agent` line), sitemap (`/sitemap.xml` or a `Sitemap:` line), homepage `Link` headers with agent-useful rels (`service-desc`, `describedby`, `api-catalog`).
- **L2:** L1 + AI bot rules (named bots *or wildcard rules*) + `Content-Signal` in robots.txt.
- **L3:** L2 + `Accept: text/markdown` on the homepage returns `text/markdown`.
- **L4:** L3 + 1 of: MCP Server Card (`/.well-known/mcp/server-card.json`), A2A card, Agent Skills index, API Catalog (RFC 9727 linkset).
- **L5:** L4 + 2 of 3: Web Bot Auth, all four integration checks, auth metadata (OAuth discovery, protected-resource metadata or `/auth.md`).

**is-agentic.com** (Vercel with Ora) has an essential pool worth 80 points: server-rendered content, correct HTTP behaviour, document structure, recoverable errors, canonical URL, declared language and OG tags. A recommended pool worth 20 points applies only when it detects an API, OAuth or MCP. It checks that Markdown is served at the same URL with `Vary` set ([is-agentic.com](https://is-agentic.com/)). Neither page names individual check IDs.

**Standards:**

- **llms.txt:** H1 (required), blockquote summary, H2 link lists, an `## Optional` section, `.md` twins of pages, and `rel="describedby"` pointing at the file ([llmstxt.org](https://llmstxt.org/)).
- **RFC 9727:** `/.well-known/api-catalog`, `application/linkset+json`, entries with `service-desc` (OpenAPI) and `service-doc` (HTML docs) ([RFC 9727](https://www.rfc-editor.org/rfc/rfc9727.html)).

## What HCI says

There isn't much primary HCI work on this yet, and what exists is about browser agents, not discovery files.

- "Building Browser Agents" says "accessibility tree snapshots are not a universal solution" because "many production web properties are not fully compliant with … WCAG", and then the snapshot "either hides important interactions or presents them in an order" the model finds hard to interpret ([arXiv 2511.19477](https://arxiv.org/html/2511.19477v1)). So semantic HTML helps the same agents that help screen-reader users. That is a fair reason to do T38 for people as well as agents.
- Blogs cite a CHI 2026 paper ("Is the Web Accessible for AI Agents?") with success falling from 78% to 42% on pages with a degraded accessibility tree. I couldn't find the primary source, so I'm not relying on that figure.
- Discovery is the agent's version of what this course calls information scent. Evil Martians' log data is the behavioural evidence for it: agents follow a cheap, typed path (`Accept` header, `Link` rel) and ignore hint files nobody asks for (meta tags, `ai.txt`, HTML comments, "AI info pages" all got roughly zero follows in their logs).

## What Post-its has today

- **Public, server-rendered pages already exist:** `/readme/` (README rendered on the server, `lang="en"`, `<main>`) and `/docs/` (Infima, Markdown rendered on the server, versioned, with h1, `<main>` and no script), in `server/src/static.ts` and `server/src/docs.ts`. **The Markdown sources are already on disk** (`README.md`, `docs/site/**/*.md`), so content negotiation for these pages means returning the file we already read, with no HTML-to-Markdown conversion.
- **Everything else is the SPA.** `serveClient` returns `index.html` for any path without a file extension, with a 200 (`static.ts` `serveClient`). So today `/robots.txt` and `/sitemap.xml` 404 (they have extensions and aren't in `client/public/`), **but `/.well-known/api-catalog`, `/.well-known/mcp/server-card.json` or `/auth.md`-style paths without extensions would come back as a 200 with the app's HTML**. That is exactly the "HTML 200 lies" failure, and probably also is-agentic.com's "recoverable errors" check. Any shape should 404 unknown `/.well-known/*` paths.
- `index.html` has `lang`, a title and a `<noscript>` link to `/readme/`, but no description, canonical or OG tags, and nothing renders on the server. Boards (`/`, `/<username>`, channels) all require login (`requireUser` on every `/api/boards/*` route), **so there are no public board pages to index**, and the sitemap should list only `/readme/` and `/docs/**`.
- The `/api/*` surface is about 25 routes registered in one place (`server/src/index.ts`), all cookie-authed. A token or MCP surface doesn't exist on this branch yet; it is `feat/agent-mcp` (seed only, no commits beyond the start). The CSP and `SECURITY_HEADERS` are set in `dispatch`, so headers such as `Link` and `Vary` have a single place to go.
- ADR-0001 chose a remote `/mcp` endpoint on the same process precisely so it would be "detectable at the domain by exactly the scanners this project cares about", which makes this idea the second half of that decision.

## Shapes

### A. Honest basics (isitagentready Level 3, no dependency)

This shape is the files and headers that agents and crawlers actually use, built only on what exists today:

- `/robots.txt`: a single `User-agent: *` group with `Content-Signal`, `Disallow: /api/`, and a `Sitemap:` line. A wildcard group passes the AI-rules check and avoids the ant-design bug where named groups hide the signal.
- `/sitemap.xml`: built from the `/readme/` and `/docs/**` page list `docs.ts` already loads.
- `Accept: text/markdown` on `/`, `/readme/` and every `/docs/**` page, returning the source `.md` with `Vary: Accept`, plus `.md` twins. `/` gets a short Markdown page saying what Post-its is and linking to the docs.
- A `Link` header on `/` (`rel="alternate" type="text/markdown"`, `rel="describedby"`).
- A real 404 for unknown `/.well-known/*` paths.
- Meta description, canonical and OG tags in `index.html`.

**For:** coding agents a user points at the site (Claude Code makes 94% of Markdown traffic, per [Evil Martians](https://evilmartians.com/chronicles/how-to-make-your-website-visible-to-llms)), plus crawlers.

**Cost:** small. Everything is server-only in `static.ts`/`docs.ts` and nothing touches the board UI. A spec test can curl each route.

**Riskiest assumption:** that the owner is fine with stating a `Content-Signal` policy (ai-train yes or no is their call, not ours).

### B. Basics plus pointers to the agent surface (Level 4–5, after agent-mcp)

This is A, plus a small, truthful set of pointers from the domain to agent-mcp's surface:

- `/.well-known/api-catalog` (RFC 9727): one linkset entry for `/api` with `service-desc` → `/openapi.json` and `service-doc` → a `/docs/` page, and one entry for `/mcp`.
- `/.well-known/mcp/server-card.json`: name, version, Streamable HTTP endpoint `/mcp`, and its tools.
- `/auth.md`: "generate a token in Settings, send `Authorization: Bearer pit_…`", with the three error codes from ADR-0001.
- `/llms.txt`: H1, summary, and links to the docs, the auth page and the MCP docs.
- A hand-written `openapi.json` covering the token-authed routes agent-mcp adds. The cookie routes are listed but marked as internal for the browser.
- A spec test that fails if a route in `index.ts` is missing from `openapi.json`, so the document can't drift.

**For:** the owner's planned spine ("a documented `/api/*` surface", backlog T40), and anyone wiring Post-its into their own agent.

**Evidence:**

- Agents fetch "how to connect to X" pages most ([Suganthan](https://suganthan.com/blog/cloudflare-markdown-for-agents/)).
- Both scanners publish exactly this set themselves ([isitagentready](https://isitagentready.com/llms-full.txt), [is-agentic](https://is-agentic.com/)).
- ADR-0001 wants `/mcp` to be discoverable at the domain.

**Cost:** medium-small. It is 4 static files plus an OpenAPI document, and it **blocks on agent-mcp** for the token route names and the MCP tool list.

**Riskiest assumption:**

- The emerging specs keep their current paths. The MCP server card is still a proposal (SEP-1649), and search results say an AI Catalog draft (`/.well-known/ai-catalog.json`) may supersede it. I didn't open a primary source for that, so the builder should check the current MCP spec before choosing a path.
- An OpenAPI document for a cookie-authed SPA API may mislead more than it helps.

### C. Docs-first, for coding agents only

Skip the catalog machinery. Make `/docs/` itself the agent surface:

- Markdown negotiation and `.md` twins on `/docs/**`.
- `/llms.txt` as the index of the docs.
- One "Connect your agent" docs page (MCP URL, token steps, example config) written by agent-mcp's documenter.
- An `/.well-known/agent-skills/index.json` that points at the Claude Code skill agent-mcp is already planning to ship.
- robots.txt and sitemap as in A.

No `openapi.json`, no server card.

**For:** the one audience the logs show actually reads Markdown, coding agents ([Evil Martians](https://evilmartians.com/chronicles/how-to-make-your-website-visible-to-llms)).

**Cost:** the smallest. It reuses the docs site and adds one agent-skills index.

**Riskiest assumption:** that scanners count Agent Skills alone as "integrated". isitagentready does (1 of 4 for L4), but it leaves T40's "documented `/api/*` surface" undone, which the owner wrote into the spine.

## Recommendation

Shape **B, built in two steps**:

1. Build A's basics now. They have no dependency, and the real bug they fix (`/.well-known/*` returning a 200 with the SPA) is worth fixing anyway.
2. Add the pointers (api-catalog, server card, `/auth.md`, llms.txt, `openapi.json` guarded by a drift test) once agent-mcp merges.

This is the only shape that finishes T37–T40 as the owner wrote them. It stays honest because every pointer leads to something real, and it adds no screen.

## Sources

https://isitagentready.com/
https://isitagentready.com/llms-full.txt
https://is-agentic.com/
https://is-agentic.com/methodology
https://llmstxt.org/
https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
https://www.rfc-editor.org/rfc/rfc9727.html
https://news.ycombinator.com/item?id=46058273
https://news.ycombinator.com/item?id=41439983
https://news.ycombinator.com/item?id=44759462
https://suganthan.com/blog/cloudflare-markdown-for-agents/
https://evilmartians.com/chronicles/how-to-make-your-website-visible-to-llms
https://github.com/ant-design/ant-design/pull/57903
https://apievangelist.com/blog/2026/05/22/four-providers-publishing-well-known-api-catalog/
https://arxiv.org/html/2511.19477v1
