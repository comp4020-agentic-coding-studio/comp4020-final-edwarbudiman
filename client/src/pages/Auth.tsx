import { useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "../api.ts";
import type { Me } from "../api.ts";
import { navigate } from "../router.tsx";

export function AuthPage({ mode, next, onDone }: { mode: "login" | "signup"; next: string; onDone: (me: Me) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = signup ? { username, password, email: email.trim() || undefined } : { username, password };
      const r = await api<{ user: Me }>("POST", signup ? "/api/signup" : "/api/login", body);
      navigate(next === "/signup" ? "/" : next, true);
      onDone(r.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const switchTo = (to: string) => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setError(null);
    navigate(to);
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <h1 className="brand">
          <span className="brand-mark" aria-hidden /> Post-its
        </h1>
        <p className="tagline">A blank board for your notes.</p>
        <form onSubmit={submit} noValidate>
          <h2>{signup ? "Create an account" : "Log in"}</h2>
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_\-]{3,20}"
              aria-describedby={signup ? "username-hint" : undefined}
            />
          </label>
          {signup && (
            <p className="hint" id="username-hint">
              3–20 characters: letters, digits, _ or -. Everyone can see it.
            </p>
          )}
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={signup ? 8 : undefined}
            />
          </label>
          {signup && <p className="hint">At least 8 characters.</p>}
          {signup && (
            <>
              <label>
                Email <span className="optional">(optional)</span>
                <input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              {!email.trim() && (
                <p className="warning" role="note">
                  <strong>No email, no recovery.</strong> Without an email there is no way to reset a forgotten password: the account and
                  its notes would be lost for good.
                </p>
              )}
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "…" : signup ? "Create account" : "Log in"}
          </button>
        </form>
        <p className="switch">
          {signup ? (
            <>
              Have an account?{" "}
              <a href="/login" onClick={switchTo("/login")}>
                Log in
              </a>
            </>
          ) : (
            <>
              New here?{" "}
              <a href="/signup" onClick={switchTo("/signup")}>
                Create an account
              </a>
            </>
          )}
        </p>
        <p className="demo-hint">
          Just looking? Log in as <code>demo1</code> or <code>demo2</code> — the password is in the <a href="/readme/">README</a>.
        </p>
      </div>
    </main>
  );
}
