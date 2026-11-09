# Decision: agent-discovery

## Picked

Shape B from `research.md`, built from two briefs on `feat/agent-discovery`.

**Brief 1 (now, no dependency):**
- `/robots.txt`: one `User-agent: *` group with `Content-Signal: search=yes, ai-input=yes, ai-train=yes`, `Disallow: /api/` and `Disallow: /mcp`, and a `Sitemap:` line.
- `/sitemap.xml`: lists only `/readme/` and the `/docs/**` pages.
- `Accept: text/markdown` on `/`, `/readme/` and `/docs/**`, plus `.md` versions of those pages, all with `Vary: Accept`. On `/` the Markdown is a fixed public "what Post-its is" page with links to `/readme/` and `/docs/`. It never depends on who is logged in and never contains board data.
- A `Link` header on `/` with `rel="alternate"` (type `text/markdown`) and `rel="describedby"`.
- A real 404 for unknown `/.well-known/*` paths, instead of a 200 with the app's HTML.
- Meta description, canonical and Open Graph tags in `index.html`.

**Brief 2 (after agent-mcp merges):**
- `/.well-known/api-catalog` (RFC 9727).
- One MCP discovery file, at the path the current MCP spec names at build time. That is either the server card or whatever has replaced it, never both.
- `/auth.md` for the token flow.
- `/llms.txt`.
- A hand-written `openapi.json` that covers only the token-authed routes, with a spec test that fails if a token route in `server/src/index.ts` is missing from it.

## Why

- The owner picked B because it finishes checkpoint G (T37–T40) as written in the spine and makes agent-mcp's `/mcp` discoverable at the domain, as ADR-0001 intended.
- Building in two steps means brief 1 needs nothing from agent-mcp. It also fixes a real bug: today any extensionless `/.well-known/*` path returns a 200 with the app's HTML.
- On AI policy, the owner's words were "we allow AI to go": search, AI input and AI training are all yes.
- On the OpenAPI scope, the owner asked for whichever option was "more simple and more safe". That is the token routes only: the document stays small, and it doesn't advertise the cookie routes the browser uses.
- **Site direction.** In the owner's words: "if we add more route like this for the AI agents, do it properly." So every new route for agents:
  - is registered in one place next to the existing routes;
  - returns the right content type and status;
  - is never swallowed by the SPA catch-all;
  - is covered by a spec test;
  - is linked from wherever an agent would look for it.

  Discovery also stays invisible to people: no new screen, no "AI info" page, no public boards just to have something to index.

## Not picked

- **A on its own:** it stops at isitagentready level 3 and leaves T40 (a documented API surface) and the `/mcp` pointer undone. It isn't dropped: it becomes brief 1 of B.
- **C (docs first):** it leaves T40 undone. Its "Connect your agent" docs page can still come from agent-mcp's documenter.

## It works if

1. `curl /robots.txt` returns 200 `text/plain` with one `User-agent: *` group, `Content-Signal: search=yes, ai-input=yes, ai-train=yes`, `Disallow: /api/`, `Disallow: /mcp` and a `Sitemap:` line. `/sitemap.xml` lists only `/readme/` and `/docs/**` pages, and every URL in it returns 200.
2. With `Accept: text/markdown`, `curl` on `/`, `/readme/` and a `/docs/` page returns `Content-Type: text/markdown` with `Vary: Accept`. On `/` the body is the same public about page whether the request carries a session cookie or not, and it contains no board data. A normal browser request to `/` still gets the app.
3. `curl /.well-known/anything-unknown` returns 404, not the app's HTML, and a spec test covers it. Every new agent route is covered by a spec test that checks its status and content type.
4. *(Brief 2)* Every URL in api-catalog, the MCP discovery file, `/auth.md` and `/llms.txt` returns a real, non-SPA response. The OpenAPI drift test fails when a token route is missing from `openapi.json`.
5. Before and after results from isitagentready.com and is-agentic.com are recorded in the review. Each check still failing has a written reason, such as "needs a real signing key" or "would mean public boards, against the thesis". The board UI is unchanged.

## Spike question

Point Claude Code at the spike URL and ask: "What is Post-its and how do I read its docs?" Does it answer correctly by reading the Markdown versions and robots.txt and the sitemap, without loading the app shell?

## Open questions

- Brief 2: the MCP discovery path (server card under SEP-1649, or an AI Catalog file) is checked against the current spec at build time.
- Brief 2 can't start until agent-mcp merges and its token route names and MCP tool list are known.
