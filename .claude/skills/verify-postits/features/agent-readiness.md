# Agent readiness

An agent or crawler that visits Post-its gets true answers. A path that isn't a page is a real `404`, in Markdown when the client asks for it. The homepage has readable text in the raw HTML (React replaces it on mount), plus `og:image` and `WebApplication` JSON-LD. People see almost no change: a logged-in user opening a missing board still sees the app's own "There's no user called …" view.

## Sub-features

- `agent-404-markdown` `Accept: text/markdown` on any missing path (`/graphql`, `/c/nope-xyz`, `/foo/bar`, `/.well-known/xyz`, `/foo.php`, `/readme/nope`, `/docs/nope/`) is `404`, `text/markdown; charset=utf-8`, `Vary: Accept`, and links `/docs/`, `/sitemap.xml` and `/index.md`.
- `agent-404-method` any method on a missing path is `404`, so `POST /graphql` is `404`, not `405`. A path that exists (`POST /robots.txt`) is still `405`.
- `agent-404-shell` without that header, a missing page path is `404` with the app shell and "No such board" inside `#root`, and no canonical link.
- `agent-shell-200` `/`, `/<existing user>` (any case, with or without `/`), `/c/<existing channel>`, `/settings`, `/stats`, `/login`, `/signup` and `/u/<existing user>` stay `200`. `/admin` and `/about` are `404`.
- `agent-home-text` the raw HTML of `/` has an H1, 500+ characters, and links to `/readme/`, `/docs/` and `/sitemap.xml` inside `#root`.
- `agent-head` `og:image` (with width, height, type, alt), one `WebApplication` JSON-LD block on `/` only, a self canonical on other 200 shells, none on 404 shells.
- `agent-in-app` logged in, `/nosuchuser` shows "There's no user called …" with the sidebar; `/` is your board. Logged out, `/nosuchuser` shows "No such board"; `/` shows the login page.

## How to get to it (user POV)

- Nothing new to click. Open a wrong address like `/nosuchuser` (logged in or out), or `curl` the paths above.

## Driving it with claude-in-chrome

Preconditions: baseline launch from `../SKILL.md`, an existing `demo1` / `demo2`. Use `$PORT` (the server serves the built client) or `$VERIFY_CLIENT_PORT`.

- **Curl matrix.** For each path in `agent-404-markdown`: `curl -sS -i -H 'Accept: text/markdown' localhost:$PORT<path>`; report the status line, `Content-Type`, `Vary`, and that the body contains `/docs/` and `/sitemap.xml`. Then `curl -i -X POST localhost:$PORT/graphql` (404) and `curl -i -H 'Accept: text/html' localhost:$PORT/this-page-does-not-exist-xyz` (404, `text/html`, "No such board", no `rel="canonical"`).
- **Raw home.** `curl -s localhost:$PORT/ -H 'Accept: text/html'`: an `<h1>` inside `#root`, `og:image`, one `application/ld+json`.
- **Logged in, missing user.** Log in as `demo1`, open `/nosuchuser`: "There's no user called “nosuchuser”." with the sidebar. Screenshot. Open `/`: your board. Screenshot.
- **Logged out, missing board.** Log out, open `/nosuchuser`: the page reads "No such board" with links to `/`, `/readme/`, `/docs/`. Open `/`: the login page. Screenshot each.
- **Flash.** On Chrome DevTools throttling "Slow 3G", reload `/` and watch for the about text before the app mounts (it is expected and fine).

## Gotchas

- Logged out, the SPA treats every path as "log in, then go there", so `/nosuchuser` logged out shows the server's "No such board" only until the app mounts and replaces it with the login page. Take that screenshot with JavaScript throttled or read the raw HTML.
- Seeded users are `demo1` and `demo2`; `/demo` is a 404.
- A repeated spec run against one server hits the signup limit (200 an hour per IP): start the server with `SIGNUP_LIMIT_PER_HOUR=5000`.
