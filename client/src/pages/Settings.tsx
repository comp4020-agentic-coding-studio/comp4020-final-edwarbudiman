import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "../api.ts";
import type { Me } from "../api.ts";
import { Link, useSession } from "../router.tsx";
import { Header } from "./Header.tsx";
import { can3D, isSimple, setSimple } from "../space/viewMode.ts";
import { mcpUrl, setupMessage } from "../agentSetup.ts";

interface TokenInfo {
  exists: boolean;
  created_at: number | null;
  last_used_at: number | null;
}
const when = (t: number | null) => (t === null ? "never" : new Date(t).toLocaleString());

export function Settings() {
  const { me, setMe } = useSession();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState(me.email ?? "");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [simple, setSimpleState] = useState(isSimple);

  // the agent token: the raw token is shown once, right after it's made
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api<TokenInfo>("GET", "/api/me/token").then(setTokenInfo).catch(() => setTokenInfo({ exists: false, created_at: null, last_used_at: null }));
  }, []);
  const message = rawToken ? setupMessage(location.origin, rawToken) : "";

  async function makeToken() {
    try {
      const r = await api<{ token: string }>("POST", "/api/me/token");
      setRawToken(r.token);
      setCopied(false);
      setTokenInfo(await api<TokenInfo>("GET", "/api/me/token"));
    } catch (err) {
      report(err);
    }
  }
  async function revokeToken() {
    try {
      await api("DELETE", "/api/me/token");
      setRawToken(null);
      setTokenInfo({ exists: false, created_at: null, last_used_at: null });
      setMsg({ ok: true, text: "Token revoked. Your agent can't reach your board any more." });
    } catch (err) {
      report(err);
    }
  }
  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setMsg({ ok: false, text: "Couldn't copy. Select the message and copy it yourself." });
    }
  }

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

        <section className="card agent-card">
          <h2>Connect your agent</h2>
          <p className="hint">
            Your own AI agent can read your board, move notes forward and add notes into your sections, acting as you with exactly your permissions. Everyone watching sees its changes marked as made by your agent.
          </p>
          {rawToken ? (
            <>
              <p className="hint">Paste this into a chat with your agent. It sets itself up. The token is shown only now.</p>
              <textarea className="agent-message" readOnly rows={9} value={message} onFocus={(e) => e.currentTarget.select()} aria-label="Setup message for your agent" />
              <div className="agent-actions">
                <button type="button" className="primary" onClick={() => void copyMessage()}>
                  {copied ? "Copied" : "Copy setup message"}
                </button>
                <button type="button" onClick={() => void makeToken()}>
                  Make a new token
                </button>
                <button type="button" onClick={() => void revokeToken()}>
                  Revoke
                </button>
              </div>
            </>
          ) : tokenInfo?.exists ? (
            <>
              <p className="hint">
                An agent token is active. Made {when(tokenInfo.created_at)}, last used {when(tokenInfo.last_used_at)}. Its message was shown once; make a new token for a fresh one (the old one stops working at once).
              </p>
              <div className="agent-actions">
                <button type="button" onClick={() => void makeToken()}>
                  Make a new token
                </button>
                <button type="button" onClick={() => void revokeToken()}>
                  Revoke
                </button>
              </div>
            </>
          ) : (
            <div className="agent-actions">
              <button type="button" className="primary" disabled={tokenInfo === null} onClick={() => void makeToken()}>
                Make a token
              </button>
            </div>
          )}
          <p className="hint agent-url">MCP address: <code>{mcpUrl(location.origin)}</code></p>
        </section>

        <section className="card">
          <h2>View</h2>
          {can3D() ? (
            <label className="switch-row">
              <input
                type="checkbox"
                checked={simple}
                onChange={() => {
                  setSimple(!simple);
                  setSimpleState(!simple);
                }}
              />
              <span>
                <strong>Simple mode</strong>
                <br />
                <span className="hint">Always open on the flat board. You can still step into the 3D room with M.</span>
              </span>
            </label>
          ) : (
            <p className="muted">This device only gets the flat board: the 3D room needs WebGL and a mouse or trackpad.</p>
          )}
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
