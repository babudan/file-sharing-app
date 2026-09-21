export type User = { id: string; email: string; name: string };

export type WorkspaceSummary = {
  id: string;
  name: string;
  isPersonal: boolean;
  role: "OWNER" | "ADMIN" | "MEMBER";
  documentCount: number;
  memberCount: number;
};

export type WorkspaceDetail = {
  id: string;
  name: string;
  isPersonal: boolean;
  role: "OWNER" | "ADMIN" | "MEMBER";
  members: { userId: string; email: string; name: string; role: string; joinedAt: string }[];
  invitations: { id: string; email: string; role: string; expiresAt: string; url: string }[];
  documents: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    uploadedBy: { id: string; name: string; email: string };
  }[];
};

export type ShareLink = {
  id: string;
  url: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  hasPassword: boolean;
  createdAt: string;
};

export type PublicShare = {
  id: string;
  requiresPassword: boolean;
  unlocked: boolean;
  filename: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  expiresAt: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const raw = await response.text();
  let data: T & { message?: string } = {} as T & { message?: string };
  if (raw) {
    try {
      data = JSON.parse(raw) as T & { message?: string };
    } catch {
      data = { message: raw } as T & { message?: string };
    }
  }
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

export const api = {
  me: () => request<{ user: User }>("/api/auth/me"),
  register: (body: { name: string; email: string; password: string }) =>
    request<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  pendingInvites: () =>
    request<{ invitations: { token: string; workspaceName: string; invitedByName: string; role: string }[] }>(
      "/api/auth/me/invites",
    ),
  workspaces: () => request<{ workspaces: WorkspaceSummary[] }>("/api/workspaces"),
  createWorkspace: (name: string) =>
    request<{ workspace: WorkspaceSummary }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  workspace: (id: string) => request<{ workspace: WorkspaceDetail }>(`/api/workspaces/${id}`),
  invite: (workspaceId: string, email: string, role: "ADMIN" | "MEMBER") =>
    request<{
      invitation: { url: string; emailSent: boolean; emailSkipped: boolean; email: string };
    }>(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  removeMember: (workspaceId: string, userId: string) =>
    request<void>(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" }),
  deleteWorkspace: (workspaceId: string) =>
    request<void>(`/api/workspaces/${workspaceId}`, { method: "DELETE" }),
  invitation: (token: string) =>
    request<{ invitation: { email: string; role: string; workspaceName: string; invitedByName: string } }>(
      `/api/invites/${token}`,
    ),
  acceptInvite: (token: string) =>
    request<{ workspaceId: string }>(`/api/invites/${token}/accept`, { method: "POST" }),
  upload: async (workspaceId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{ document: { id: string } }>(`/api/workspaces/${workspaceId}/documents`, {
      method: "POST",
      body,
    });
  },
  deleteDocument: (id: string) => request<void>(`/api/documents/${id}`, { method: "DELETE" }),
  shares: (documentId: string) => request<{ shares: ShareLink[] }>(`/api/documents/${documentId}/shares`),
  createShare: (
    documentId: string,
    body: { expiresInHours?: number; maxDownloads?: number; password?: string },
  ) =>
    request<{ share: ShareLink }>(`/api/documents/${documentId}/shares`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeShare: (shareId: string) => request<void>(`/api/shares/${shareId}`, { method: "DELETE" }),
  publicShare: (token: string) => request<{ share: PublicShare }>(`/api/public/shares/${token}`),
  unlockShare: (token: string, password: string) =>
    request<{ share: PublicShare }>(`/api/public/shares/${token}/unlock`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
};
