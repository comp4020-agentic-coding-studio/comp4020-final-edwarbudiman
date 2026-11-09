# Agent readiness

An agent or crawler that visits Post-its gets true answers. A path that isn't a page is a real `404`, in Markdown when the client asks for it. The homepage has readable text in the raw HTML (React replaces it on mount), plus `og:image` and `WebApplication` JSON-LD. People see almost no change: a logged-in user opening a missing board still sees the app's own "There's no user called …" view.

## Sub-features

- `agent-404-markdown` `Accept: text/markdown` on any missing path (`/graphql`, `/c/nope-xyz`, `/foo/bar`, `/.well-known/xyz`, `/foo.php`, `/readme/nope`, `/docs/nope/`) is `404`, `text/markdown; charset=utf-8`, `Vary: Accept`, and links `/docs/`, `/sitemap.xml` and `/index.md`.
- `agent-404-method` any method on a missing path is `404`, so `POST /graphql` is `404`, not `405`. A path that exists (`POST /robots.txt`) is still `405`.
- `agent-404-shell` without that header, a missing page path is `404` with the app shell and "No such board" inside `#root`, and no canonical link.
- `agent-shell-200` `/`, `/<existing user>` (any case, with or without `/`), `/c/<existing channel>`, `/settings`, `/stats`, `/login`, `/signup` and `/u/<existing user>` stay `200`. `/admin` and `/about` are `404`.
- `agent-home-text` the raw HTML of `/` has an H1, 500+ characters, and links to `/readme/`, `/docs/` and `/sitemap.xml` inside `#root`.
- `agent-head` `og:image` (with width, height, type, alt), one `WebApplication` JSON-LD block on `/` only, a self canonical on other 200 shells, none on 404 shells.
- `agent-in-app` logged in, `/nosuchuser` shows "There's no user called …" with the sidebar; `/` is your board. Logged out, `/nosuchuser` shows a small "No such board" page with a "Log in to use Post-its" button (to the login page, then back to that path); `/` shows the login page.
- `agent-private-channel` a private (key or list) channel's slug gives the same `404` shell as a missing one, so anonymous visitors can't tell them apart. A member opening `/c/<it>` still gets the board, because the logged-in app mounts on the 404 shell. A logged-out visitor sees "No such board" and logs in from the button.

## How to get to it (user POV)

- Nothing new to click. Open a wrong address like `/nosuchuser` (logged in or out), or `curl` the paths above.

## Driving it with claude-in-chrome

Preconditions: baseline launch from `../SKILL.md`, an existing `demo1` / `demo2`. Use `$PORT` (the server serves the built client) or `$VERIFY_CLIENT_PORT`.

- **Curl matrix.** For each path in `agent-404-markdown`: `curl -sS -i -H 'Accept: text/markdown' localhost:$PORT<path>`; report the status line, `Content-Type`, `Vary`, and that the body contains `/docs/` and `/sitemap.xml`. Then `curl -i -X POST localhost:$PORT/graphql` (404) and `curl -i -H 'Accept: text/html' localhost:$PORT/this-page-does-not-exist-xyz` (404, `text/html`, "No such board", no `rel="canonical"`).
- **Raw home.** `curl -s localhost:$PORT/ -H 'Accept: text/html'`: an `<h1>` inside `#root`, `og:image`, one `application/ld+json`.
- **Logged in, missing user.** Log in as `demo1`, open `/nosuchuser`: "There's no user called “nosuchuser”." with the sidebar. Screenshot. Open `/`: your board. Screenshot.
- **Logged out, missing board.** Log out, open `/nosuchuser`: the app shows "No such board", links to `/readme/` and `/docs/`, and a "Log in to use Post-its" button. Click it: the login page; log in as `demo1` and you land on `/nosuchuser` (the in-app "There's no user called …"). Open `/`: the login page. Screenshot each and save them to disk.
- **Private channel.** As `demo1` create a key channel, then open `/c/<slug>` logged in (the board) and logged out (the "No such board" page). `curl -i localhost:$PORT/c/<slug>` is `404`, the same as `/c/nosuch`.
- **Flash.** On Chrome DevTools throttling "Slow 3G", reload `/` and watch for the about text before the app mounts (it is expected and fine).

## Gotchas

- The server marks a 404 shell with `data-status="404"` on `#root`. The client reads it once, at load, so after you click "Log in" or navigate inside the app the usual login page applies.
- Canonical is lower case with no trailing slash: `/Demo1/` has `${ORIGIN}/demo1`.
- Seeded users are `demo1` and `demo2`; `/demo` is a 404.
- A repeated spec run against one server hits the signup limit (200 an hour per IP): start the server with `SIGNUP_LIMIT_PER_HOUR=5000`.

## Part 2: /openapi.json and /llms.txt

Curl against your local server (no browser needed):

- `curl -si localhost:$PORT/openapi.json` gives `200 application/json`, `"openapi": "3.1.0"`, one path `/mcp` with `operationId` `callPostitsTool`.
- `curl -si localhost:$PORT/llms.txt` gives `200 text/plain`, an H1 "Post-its" and a `## When to use Post-its` section.
- `curl -sI -H 'Accept: text/html' localhost:$PORT/` has `</openapi.json>; rel="service-desc"` in `Link`.
- `/sitemap.xml` lists both; `POST /openapi.json` gives 405.
