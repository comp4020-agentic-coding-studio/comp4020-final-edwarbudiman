---
title: Pointing an agent at Post-its
order: 10
idea: agent-discovery
summary: An agent you point at the site can read what Post-its is and its docs as plain Markdown, without loading the app.
image: discovery.webp
---

# Pointing an agent at Post-its

If you ask your own agent (Claude Code, say) about Post-its, it shouldn't have to load the whole app to answer. The site answers agents in plain Markdown, and you see no change on your board.

## How to use it

1. In your agent, give it the site's address and ask a plain question, for example "What is Post-its and how do I read its docs?" It reads the Markdown pages instead of the app.
2. To see what the agent sees, ask for Markdown yourself: `curl -H 'Accept: text/markdown' <origin>/`. You get a short public page about Post-its, with links to the README and the docs.
3. The same works for `/readme/` and every page under `/docs/`. Add `Accept: text/markdown` and you get Markdown, and without it you get the normal page.
4. Or ask for a page's Markdown directly with `.md` on the end: `<origin>/index.md`, `<origin>/readme.md`, `<origin>/docs/features/notes.md`. The docs index is `<origin>/docs/index.md`.
5. To list every page an agent should read, open `<origin>/sitemap.xml`. It has the README and the current docs pages, and nothing else.
6. `<origin>/robots.txt` says what crawlers may do. It has one group for everyone, and points at the sitemap.

## Good to know

- I allow AI to use the public pages: the robots.txt line `Content-Signal: search=yes, ai-input=yes, ai-train=yes` says yes to search, AI input and AI training.
- `/api/` and `/mcp` are disallowed in robots.txt, so crawlers keep out of them.
- The Markdown for `/` is the same for everyone, signed in or not. It never contains a board or a note.
- Boards aren't listed in the sitemap, and there is no public board made just to be found.
- An address under `/.well-known/` that doesn't exist answers 404 with plain text, not the app.
- Tokens for your own agent and the MCP server aren't here yet. They come in the next round, and will get their own pages in this section.

## Checked by

- `spec/discovery.test.ts`:
  - `robots.txt`: 200 `text/plain`, one `User-agent: *` group with the Content-Signal line, both `Disallow` lines and the `Sitemap:` line;
  - `sitemap.xml`: lists only `/readme/` and `/docs/` pages, and every listed page returns 200;
  - `Accept: text/markdown` on `/`, `/readme/` and docs pages returns `text/markdown` with `Vary: Accept`, the `.md` addresses return the same bytes, and a browser's `Accept` still gets HTML;
  - `/` as Markdown is identical with and without a session cookie and holds no board data, and never says "label";
  - the `Link` header on `/` and on pages that have a Markdown twin, and none on old versions or 404s;
  - unknown `/.well-known/` paths return 404 `text/plain`;
  - the Agents navbar link, and that a page in `docs/site/agents/` appears in the sitemap with its `.md` twin.
- `spec/routes.test.ts`: the new root names are in the route list, and nobody can register them as a username.

Built through the agent pipeline: research → decide → spike → build → review. See [Pipeline](/docs/pipeline/).
