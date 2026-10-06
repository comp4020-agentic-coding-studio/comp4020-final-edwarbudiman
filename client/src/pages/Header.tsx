import type { ReactNode } from "react";
import { api } from "../api.ts";
import { Link, useSession } from "../router.tsx";

/** The slim bar on the pages that aren't the board (settings, not found, …). */
export function Header({ children }: { children?: ReactNode }) {
  const { setMe } = useSession();
  async function logout() {
    await api("POST", "/api/logout").catch(() => {});
    history.replaceState(null, "", "/");
    setMe(null);
  }
  return (
    <header className="topbar">
      <Link to="/" className="back">
        ← Back to your board
      </Link>
      <div className="topbar-middle">{children}</div>
      <nav className="topnav" aria-label="Account">
        <Link to="/settings">Settings</Link>
        <button className="link" onClick={logout}>
          Log out
        </button>
      </nav>
    </header>
  );
}
