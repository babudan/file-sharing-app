import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type User, type WorkspaceSummary } from "./api";

export function HomePage({ user }: { user: User }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [invites, setInvites] = useState<{ token: string; workspaceName: string; invitedByName: string }[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [{ workspaces: next }, pending] = await Promise.all([api.workspaces(), api.pendingInvites()]);
    setWorkspaces(next);
    setInvites(pending.invitations);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    await api.createWorkspace(name);
    setName("");
    await load();
  }

  return (
    <div className="stack">
      {invites.length > 0 && (
        <div className="banner">
          You have pending invitations:{" "}
          {invites.map((inv) => (
            <Link key={inv.token} to={`/invites/${inv.token}`}>
              {inv.workspaceName} from {inv.invitedByName}
            </Link>
          ))}
        </div>
      )}
      <div className="card stack">
        <h2>Workspaces</h2>
        <p className="muted">
          Signed in as {user.name}. Personal is yours alone. Create a team workspace to invite colleagues.
        </p>
        <form className="row" onSubmit={createWorkspace}>
          <input
            placeholder="New team workspace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button>Create</button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>
      <div className="grid">
        {workspaces.map((ws) => (
          <Link key={ws.id} to={`/workspaces/${ws.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <h3>{ws.name}</h3>
            <p className="muted">
              {ws.documentCount} documents · {ws.memberCount} members
            </p>
            <span className="pill">{ws.isPersonal ? "Personal" : ws.role}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
