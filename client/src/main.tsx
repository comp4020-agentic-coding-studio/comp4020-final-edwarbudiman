import { StrictMode, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { api, boardPath, setOnUnauthorized } from "./api.ts";
import type { Me } from "./api.ts";
import { AuthPage } from "./pages/Auth.tsx";
import { BoardPage } from "./pages/Board.tsx";
import { Shell } from "./pages/Channels.tsx";
import { Settings } from "./pages/Settings.tsx";
import { Stats } from "./pages/Stats.tsx";
import { Link, SessionContext, navigate, usePath } from "./router.tsx";
import { SERVER_PAGES, SPA_PAGES } from "./routes.ts";
import "./styles.css";

/** App pages that sit at the top level next to users' boards (signup reserves these names). */
const PAGES = new Set<string>([...SPA_PAGES, ...SERVER_PAGES]);

/** Pages the server renders itself (README and the docs site), not the SPA. */
const SERVER_PAGE = new RegExp(`^/(${SERVER_PAGES.join("|")})(/|$)`);

// The server marks the shell of a missing board with data-status="404" on #root.
// Read it before React replaces #root, and only for the path that was loaded.
const rootEl = document.getElementById("root")!;
const notFoundPath = rootEl.dataset.status === "404" ? location.pathname : null;

function NoSuchBoard({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="auth">
      <div className="auth-card no-board">
        <h1>No such board</h1>
        <p>There's no board or page here, or you need to log in to see it.</p>
        <button type="button" className="primary" onClick={onLogin}>
          Log in to use Post-its
        </button>
        <p className="no-board-links">
          <a href="/readme/">README</a> · <a href="/docs/">Docs</a>
        </p>
      </div>
    </main>
  );
}

function App() {
  const path = usePath();
  const [wantsLogin, setWantsLogin] = useState(false);
  const serverPage = SERVER_PAGE.test(path);

  // if the SPA ever lands on a server page (a navigate(), popstate or a dev
  // server that served index.html), load it for real instead of showing a board
  useEffect(() => {
    if (serverPage) location.assign(location.pathname + location.search + location.hash);
  }, [serverPage]);
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    api<{ user: Me }>("GET", "/api/me")
      .then((r) => setMe(r.user))
      .catch(() => setMe(null));
  }, []);

  const expire = useCallback(() => setMe(null), []);
  useEffect(() => setOnUnauthorized(expire), [expire]);

  // your own board is /, someone else's is /<name>; old /u/<name> links and
  // /<your name> are sent to the one address they now have
  let redirect: string | null = null;
  if (me) {
    let m: RegExpMatchArray | null;
    if (path === "/login" || path === "/signup") redirect = "/";
    else if ((m = path.match(/^\/u\/([^/]+)\/?$/))) redirect = boardPath("user", decodeURIComponent(m[1]), me.username);
    else if ((m = path.match(/^\/([^/]+)\/?$/)) && !PAGES.has(m[1]) && decodeURIComponent(m[1]).toLowerCase() === me.username) redirect = "/";
  }
  useEffect(() => {
    if (redirect) navigate(redirect, true);
  }, [redirect]);

  if (serverPage) return null; // the effect above is loading the server page
  if (me === undefined) return <div className="loading">Loading…</div>;

  if (!me) {
    // a missing board, on the page the server said was missing: say so first
    if (notFoundPath === path && !wantsLogin) return <NoSuchBoard onLogin={() => setWantsLogin(true)} />;
    // login required for everything but sign-up, log-in and /readme/
    const mode = path === "/signup" ? "signup" : "login";
    const next = path === "/" || path === "/login" || path === "/signup" ? "/" : path;
    return <AuthPage mode={mode} next={next} onDone={setMe} />;
  }

  if (redirect) return null; // the effect above moves us on

  let page: ReactNode;
  let m: RegExpMatchArray | null;
  // boards sit next to the sidebar; the other pages have their own header
  const withSidebar = (board: ReactNode) => <Shell>{board}</Shell>;
  if (path === "/") page = withSidebar(<BoardPage key={`u/${me.username}`} kind="user" slug={me.username} />);
  else if ((m = path.match(/^\/c\/([^/]+)\/?$/))) page = withSidebar(<BoardPage key={`c/${m[1]}`} kind="channel" slug={decodeURIComponent(m[1])} />);
  else if (path === "/settings") page = <Settings />;
  else if (path === "/stats") page = <Stats />;
  else if ((m = path.match(/^\/([^/]+)\/?$/)) && !PAGES.has(m[1])) page = withSidebar(<BoardPage key={`u/${m[1]}`} kind="user" slug={decodeURIComponent(m[1])} />);
  else
    page = (
      <div className="page">
        <h1>Not found</h1>
        <p>
          <Link to="/">Back to your board</Link>
        </p>
      </div>
    );

  return <SessionContext.Provider value={{ me, setMe }}>{page}</SessionContext.Provider>;
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
