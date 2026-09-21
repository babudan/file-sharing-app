import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, type User } from "./api";
import { AuthPage } from "./AuthPage";
import { HomePage } from "./HomePage";
import { InvitePage, PublicSharePage } from "./SharePages";
import { WorkspacePage } from "./WorkspacePage";

export function App() {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, [location.pathname]);

  if (!ready) return null;

  return (
    <Routes>
      <Route path="/s/:token" element={<PublicSharePage />} />
      <Route path="/login" element={user ? <Navigate to="/" /> : <AuthPage mode="login" />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <AuthPage mode="register" />} />
      <Route path="/invites/:token" element={<InvitePage user={user} />} />
      <Route
        path="/*"
        element={
          user ? (
            <div className="shell">
              <header className="topbar">
                <Link className="brand" to="/">
                  Ledger
                </Link>
                <div className="row">
                  <span className="muted">{user.email}</span>
                  <button
                    className="secondary"
                    onClick={async () => {
                      await api.logout();
                      setUser(null);
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </header>
              <Routes>
                <Route path="/" element={<HomePage user={user} />} />
                <Route path="/workspaces/:workspaceId" element={<WorkspacePage user={user} />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </div>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
    </Routes>
  );
}
