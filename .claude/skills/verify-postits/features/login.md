# Log in

Log in lets a user authenticate as a demo account and land directly on their own board, with no dashboard in between.

## Sub-features

- `login-demo` logs in as a seeded demo account with the README password.
- `login-session` persists the session via a cookie so a reload stays logged in.
- `login-bad-password` rejects a wrong password and keeps the user on the login form.

## How to get to it (user POV)

- Open the app root `/`; an unauthenticated visitor sees the login form directly (no landing page).
- Fill in username and password, choose "Log in".

## Driving it with claude-in-chrome

Preconditions:

- Post-its is healthy at `http://localhost:18173` (doctor passes).
- No existing session cookie in the tab (fresh MCP tab).

- **Open login form.** Navigate to `http://localhost:18173`. `read_page` shows a `textbox` (username), a `textbox type="password"`, and `button "Log in"`.
- **Enter demo credentials.** `form_input` the username textbox with `demo1`, the password textbox with `postit-demo`.
- **Submit.** `computer left_click` on `button "Log in"`. The page transitions to the board view: `read_page` now shows `application "Your board: infinite canvas…"` and sidebar controls (`button "Browse channels"`, `button "Your board, settings, log out"`).
- **Proof.** Screenshot showing the board (not the login form) and the "Post-its" header. `curl -s http://localhost:18080/api/me -H "Cookie: sid=<value from Set-Cookie>"` returns `{"user":{"username":"demo1",...}}`.
- **Bad password (optional negative check).** Reload to `/`, submit `demo1` / `wrong-password`. The login form stays on screen; no board controls appear.

## Gotchas

- The username field has no `aria-label`, only a plain `name="username"` attribute — `read_page` lists it as a bare `textbox`; disambiguate from the password field by order or by `type="password"` on the second one.
- A successful login sets a `sid` cookie; sessions last 30 days (`config.sessionDays`), so a stale cookie from a previous run in the same tab can mask this check — always use a fresh tab or confirm `/api/me` returns 401 before starting.
- `demo1`'s own board is reachable at `/`; `demo2` would see the *same* board only by navigating to `/demo1`, not by logging in as demo1.
