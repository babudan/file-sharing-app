export type ShareState = {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
  documentDeleted: boolean;
  hasPassword: boolean;
};

export type ShareDenial =
  | "not_found"
  | "revoked"
  | "expired"
  | "download_limit"
  | "document_deleted"
  | "password_required";

export function evaluateShareAccess(
  share: ShareState | null,
  opts: { unlocked: boolean },
): { ok: true } | { ok: false; reason: ShareDenial } {
  if (!share) return { ok: false, reason: "not_found" };
  if (share.documentDeleted) return { ok: false, reason: "document_deleted" };
  if (share.revokedAt) return { ok: false, reason: "revoked" };
  if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
    return { ok: false, reason: "download_limit" };
  }
  if (share.hasPassword && !opts.unlocked) {
    return { ok: false, reason: "password_required" };
  }
  return { ok: true };
}

export function shareDenialStatus(reason: ShareDenial): number {
  switch (reason) {
    case "password_required":
      return 401;
    case "not_found":
    case "document_deleted":
      return 404;
    default:
      return 410;
  }
}

export function shareDenialMessage(reason: ShareDenial): string {
  switch (reason) {
    case "not_found":
    case "document_deleted":
      return "This share link is not valid.";
    case "revoked":
      return "This share link was revoked.";
    case "expired":
      return "This share link has expired.";
    case "download_limit":
      return "This share link has reached its download limit.";
    case "password_required":
      return "This share link is password-protected.";
  }
}
