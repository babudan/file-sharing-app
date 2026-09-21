import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "./api";
import { PasswordField } from "./PasswordField";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        await api.register({ name, email, password });
      } else {
        await api.login({ email, password });
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <div>
          <div className="brand">Ledger</div>
          <p className="muted">A small place for a team to keep and share documents.</p>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          {mode === "register" && (
            <label>
              Name
              <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <PasswordField
              value={password}
              onChange={setPassword}
              minLength={8}
              required
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button disabled={busy}>{mode === "register" ? "Create account" : "Sign in"}</button>
        </form>
        <p className="muted">
          {mode === "register" ? (
            <>
              Already have an account? <Link to="/login">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/register">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
