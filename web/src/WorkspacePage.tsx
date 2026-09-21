import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type ShareLink, type User, type WorkspaceDetail } from "./api";
import { PasswordField } from "./PasswordField";

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkspacePage({ user }: { user: User }) {
  const { workspaceId = "" } = useParams();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteEmailStatus, setInviteEmailStatus] = useState("");
  const [sharingDoc, setSharingDoc] = useState<string | null>(null);

  async function load() {
    const { workspace: next } = await api.workspace(workspaceId);
    setWorkspace(next);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [workspaceId]);

  async function onUpload(files: FileList | null) {
    if (!files?.[0]) return;
    const file = files[0];
    setError("");
    const maxBytes = 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`"${file.name}" is ${formatBytes(file.size)}. The maximum upload size is 25 MB.`);
      return;
    }
    try {
      await api.upload(workspaceId, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.invite(workspaceId, inviteEmail, inviteRole);
      setInviteUrl(result.invitation.url);
      if (result.invitation.emailSent) {
        setInviteEmailStatus(`Email sent to ${result.invitation.email}.`);
      } else if (result.invitation.emailSkipped) {
        setInviteEmailStatus("Email is not configured yet. Copy the link below.");
      } else {
        setInviteEmailStatus("Invite created, but the email could not be sent. Copy the link below.");
      }
      setInviteEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    }
  }

  if (!workspace) return <p className="muted">{error || "Loading workspace…"}</p>;

  const canInvite = workspace.role === "OWNER" || workspace.role === "ADMIN";

  return (
    <div className="stack">
      <div className="row">
        <Link to="/">← All workspaces</Link>
        <span className="pill">{workspace.role}</span>
      </div>
      <div className="card stack">
        <h2>{workspace.name}</h2>
        {error && <div className="error">{error}</div>}
        <label className="drop">
          Drop a file here or click to upload (PDF, Office, images, zip, text — 25MB max)
          <input type="file" hidden onChange={(e) => void onUpload(e.target.files)} />
        </label>
      </div>

      <div className="card">
        <h3>Documents</h3>
        {workspace.documents.length === 0 ? (
          <p className="muted">Nothing here yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Uploaded by</th>
                <th>Size</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {workspace.documents.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.filename}</td>
                  <td>{doc.uploadedBy.name}</td>
                  <td>{formatBytes(doc.sizeBytes)}</td>
                  <td className="row">
                    <a className="button secondary" href={`/api/documents/${doc.id}/download`}>
                      Download
                    </a>
                    <button className="secondary" onClick={() => setSharingDoc(doc.id)}>
                      Share
                    </button>
                    <button
                      className="danger"
                      onClick={async () => {
                        await api.deleteDocument(doc.id);
                        await load();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card stack">
        <h3>People</h3>
        <table>
          <tbody>
            {workspace.members.map((member) => (
              <tr key={member.userId}>
                <td>
                  {member.name} <span className="muted">{member.email}</span>
                </td>
                <td>
                  <span className="pill">{member.role}</span>
                </td>
                <td>
                  {member.userId !== user.id && (
                    <button
                      className="secondary"
                      onClick={async () => {
                        await api.removeMember(workspace.id, member.userId);
                        await load();
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canInvite && !workspace.isPersonal && (
          <form className="row" onSubmit={invite}>
            <input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "MEMBER" | "ADMIN")}>
              <option value="MEMBER">Member</option>
              {workspace.role === "OWNER" && <option value="ADMIN">Admin</option>}
            </select>
            <button>Invite</button>
          </form>
        )}
        {inviteUrl && (
          <p>
            {inviteEmailStatus} Link: <code>{inviteUrl}</code>
          </p>
        )}
        {workspace.invitations.map((inv) => (
          <p key={inv.id} className="muted">
            Pending: {inv.email} ({inv.role}) — <code>{inv.url}</code>
          </p>
        ))}
        {workspace.role === "OWNER" && !workspace.isPersonal && (
          <button
            className="danger"
            onClick={async () => {
              if (!confirm("Delete this workspace and its documents?")) return;
              await api.deleteWorkspace(workspace.id);
              navigate("/");
            }}
          >
            Delete workspace
          </button>
        )}
      </div>

      {sharingDoc && <ShareModal documentId={sharingDoc} onClose={() => setSharingDoc(null)} />}
    </div>
  );
}

function ShareModal({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [password, setPassword] = useState("");
  const [createdUrl, setCreatedUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { shares: next } = await api.shares(documentId);
    setShares(next);
  }

  useEffect(() => {
    void load();
  }, [documentId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    const body: { expiresInHours?: number; maxDownloads?: number; password?: string } = {};
    if (expiresInHours.trim()) {
      const hours = Number(expiresInHours);
      if (!Number.isInteger(hours) || hours < 1) {
        setError("Expires in hours must be a whole number of 1 or more.");
        return;
      }
      body.expiresInHours = hours;
    }
    if (maxDownloads.trim()) {
      const max = Number(maxDownloads);
      if (!Number.isInteger(max) || max < 1) {
        setError("Max downloads must be a whole number, or left empty.");
        return;
      }
      body.maxDownloads = max;
    }
    if (password) {
      if (password.length < 4) {
        setError("Share password must be at least 4 characters.");
        return;
      }
      body.password = password;
    }
    setBusy(true);
    try {
      const { share } = await api.createShare(documentId, body);
      setCreatedUrl(share.url);
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
        <h3>Share outside the team</h3>
        <p className="muted">Anyone with the link can download. Revoke it when you are done.</p>
        <form className="stack" onSubmit={create} autoComplete="off">
          <label>
            Expires in hours
            <input
              type="number"
              min={1}
              max={2160}
              inputMode="numeric"
              autoComplete="off"
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(e.target.value)}
            />
          </label>
          <label>
            Max downloads (optional)
            <input
              type="number"
              min={1}
              inputMode="numeric"
              autoComplete="off"
              name="share-max-downloads"
              placeholder="No limit"
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
            />
          </label>
          <label>
            Password (optional)
            <PasswordField
              value={password}
              onChange={setPassword}
              minLength={4}
              autoComplete="new-password"
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button disabled={busy}>{busy ? "Creating…" : "Create link"}</button>
        </form>
        {createdUrl && (
          <p>
            Copy this link: <code>{createdUrl}</code>
          </p>
        )}
        {shares.map((share) => (
          <div key={share.id} className="row">
            <code>{share.url}</code>
            <button
              className="secondary"
              onClick={async () => {
                await api.revokeShare(share.id);
                await load();
              }}
            >
              Revoke
            </button>
          </div>
        ))}
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
