import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type User } from "./api";
import { PasswordField } from "./PasswordField";

export function InvitePage({ user }: { user: User | null }) {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ email: string; workspaceName: string; invitedByName: string; role: string } | null>(
    null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .invitation(token)
      .then((res) => setInfo(res.invitation))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Invalid invitation"));
  }, [token]);

  async function accept() {
    const result = await api.acceptInvite(token);
    navigate(`/workspaces/${result.workspaceId}`);
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <h2>Workspace invitation</h2>
        {error && <div className="error">{error}</div>}
        {info && (
          <>
            <p>
              {info.invitedByName} invited <strong>{info.email}</strong> to join <strong>{info.workspaceName}</strong> as{" "}
              {info.role.toLowerCase()}.
            </p>
            {!user && (
              <p>
                <Link to="/register">Create an account</Link> or <Link to="/login">sign in</Link> with that email, then
                return to this page.
              </p>
            )}
            {user && user.email !== info.email && (
              <p className="error">You are signed in as {user.email}. Switch to {info.email} to accept.</p>
            )}
            {user && user.email === info.email && <button onClick={() => void accept()}>Join workspace</button>}
          </>
        )}
      </div>
    </div>
  );
}

export function PublicSharePage() {
  const { token = "" } = useParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [share, setShare] = useState<Awaited<ReturnType<typeof api.publicShare>>["share"] | null>(null);

  async function load() {
    const result = await api.publicShare(token);
    setShare(result.share);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Link is not valid"));
  }, [token]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.unlockShare(token, password);
      setShare(result.share);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock");
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <div className="brand">Ledger</div>
        <h2>Shared document</h2>
        {error && <div className="error">{error}</div>}
        {share?.requiresPassword && !share.unlocked && (
          <form className="stack" onSubmit={unlock}>
            <p className="muted">This link is password-protected.</p>
            <label>
              Password
              <PasswordField
                value={password}
                onChange={setPassword}
                required
                autoComplete="current-password"
              />
            </label>
            <button>Unlock</button>
          </form>
        )}
        {share?.unlocked && (
          <>
            <p>
              <strong>{share.filename}</strong>
            </p>
            <a className="button" href={`/api/public/shares/${token}/download`}>
              Download
            </a>
          </>
        )}
      </div>
    </div>
  );
}
