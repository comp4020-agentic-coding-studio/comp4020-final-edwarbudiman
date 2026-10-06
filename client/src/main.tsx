import { StrictMode, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { api, boardPath, setOnUnauthorized } from "./api.ts";
import type { Me } from "./api.ts";
import { AuthPage } from "./pages/Auth.tsx";
import { BoardPage } from "./pages/Board.tsx";
import { Settings } from "./pages/Settings.tsx";
import { Stats } from "./pages/Stats.tsx";
import { Link, SessionContext, navigate, usePath } from "./router.tsx";
import "./styles.css";

/** App pages that sit at the top level next to users' boards (signup reserves these names). */
const PAGES = new Set(["settings", "stats", "login", "signup", "readme"]);

function App() {
  const path = usePath();
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

  if (me === undefined) return <div className="loading">Loading…</div>;

  if (!me) {
    // login required for everything but sign-up, log-in and /readme/
    const mode = path === "/signup" ? "signup" : "login";
    const next = path === "/" || path === "/login" || path === "/signup" ? "/" : path;
    return <AuthPage mode={mode} next={next} onDone={setMe} />;
  }

  if (redirect) return null; // the effect above moves us on

  let page: ReactNode;
  let m: RegExpMatchArray | null;
  if (path === "/") page = <BoardPage key={`u/${me.username}`} kind="user" slug={me.username} />;
  else if ((m = path.match(/^\/c\/([^/]+)\/?$/))) page = <BoardPage key={`c/${m[1]}`} kind="channel" slug={decodeURIComponent(m[1])} />;
  else if (path === "/settings") page = <Settings />;
  else if (path === "/stats") page = <Stats />;
  else if ((m = path.match(/^\/([^/]+)\/?$/)) && !PAGES.has(m[1])) page = <BoardPage key={`u/${m[1]}`} kind="user" slug={decodeURIComponent(m[1])} />;
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
