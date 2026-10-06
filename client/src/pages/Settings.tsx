import { useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "../api.ts";
import type { Me } from "../api.ts";
import { Link, useSession } from "../router.tsx";
import { Header } from "./Header.tsx";

export function Settings() {
  const { me, setMe } = useSession();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState(me.email ?? "");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");

  const report = (err: unknown) => setMsg({ ok: false, text: err instanceof ApiError ? err.message : "something went wrong" });

  async function toggleAnon() {
    try {
      const r = await api<{ user: Me }>("PATCH", "/api/me", { anonymous: !me.anonymous });
      setMe(r.user);
      setMsg({ ok: true, text: r.user.anonymous ? "You're anonymous: others see your cursor as \u201csomeone\u201d." : "Others see your name on your cursor again." });
    } catch (err) {
      report(err);
    }
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ user: Me }>("PATCH", "/api/me", { email: email.trim() || null });
      setMe(r.user);
      setMsg({ ok: true, text: "Email saved." });
    } catch (err) {
      report(err);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    try {
      await api("POST", "/api/me/password", { current, password });
      setCurrent("");
      setPassword("");
      setMsg({ ok: true, text: "Password changed. Other devices have been logged out." });
    } catch (err) {
      report(err);
    }
  }

  return (
    <>
      <Header />
      <main className="page settings">
        <h1>Settings</h1>
        {msg && (
          <p className={msg.ok ? "success" : "error"} role="status">
            {msg.text}
          </p>
        )}

        <section className="card">
          <h2>Presence</h2>
          <label className="switch-row">
            <input type="checkbox" checked={me.anonymous} onChange={toggleAnon} />
            <span>
              <strong>Be anonymous on boards</strong>
              <br />
              <span className="hint">Your cursor shows as a nameless “someone”. Notes you write still show your name.</span>
            </span>
          </label>
        </section>

        <section className="card">
          <h2>Email</h2>
          {me.isDemo ? (
            <p className="muted">Demo accounts can't be changed.</p>
          ) : (
            <form onSubmit={saveEmail}>
              <label>
                Email <span className="optional">(optional)</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              {!email.trim() && (
                <p className="warning">
                  <strong>No email, no recovery.</strong> If you forget your password, the account and its notes are lost.
                </p>
              )}
              <button className="primary" type="submit">
                Save email
              </button>
            </form>
          )}
        </section>

        <section className="card">
          <h2>Password</h2>
          {me.isDemo ? (
            <p className="muted">The demo accounts' password is shared and can't be changed.</p>
          ) : (
            <form onSubmit={savePassword}>
              <label>
                Current password
                <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
              </label>
              <label>
                New password <span className="hint">(at least 8 characters)</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
              </label>
              <button className="primary" type="submit">
                Change password
              </button>
            </form>
          )}
        </section>

        <p className="muted small">
          <Link to="/stats">Live stats</Link> · <a href="/readme/">About this app</a>
        </p>
      </main>
    </>
  );
}
