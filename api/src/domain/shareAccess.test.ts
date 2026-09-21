import { describe, expect, it } from "vitest";
import { evaluateShareAccess } from "./shareAccess.js";

const base = {
  revokedAt: null,
  expiresAt: null,
  maxDownloads: null,
  downloadCount: 0,
  documentDeleted: false,
  hasPassword: false,
};

describe("evaluateShareAccess", () => {
  it("allows a live unprotected link", () => {
    expect(evaluateShareAccess(base, { unlocked: false })).toEqual({ ok: true });
  });

  it("hides deleted documents behind not-found semantics", () => {
    const result = evaluateShareAccess({ ...base, documentDeleted: true }, { unlocked: false });
    expect(result).toEqual({ ok: false, reason: "document_deleted" });
  });

  it("blocks revoked, expired, and exhausted links", () => {
    expect(evaluateShareAccess({ ...base, revokedAt: new Date() }, { unlocked: false }).ok).toBe(false);
    expect(
      evaluateShareAccess({ ...base, expiresAt: new Date(Date.now() - 1000) }, { unlocked: false }),
    ).toEqual({ ok: false, reason: "expired" });
    expect(
      evaluateShareAccess({ ...base, maxDownloads: 1, downloadCount: 1 }, { unlocked: false }),
    ).toEqual({ ok: false, reason: "download_limit" });
  });

  it("requires an unlock for password-protected links", () => {
    expect(evaluateShareAccess({ ...base, hasPassword: true }, { unlocked: false })).toEqual({
      ok: false,
      reason: "password_required",
    });
    expect(evaluateShareAccess({ ...base, hasPassword: true }, { unlocked: true })).toEqual({
      ok: true,
    });
  });

  it("treats a missing share as not found", () => {
    expect(evaluateShareAccess(null, { unlocked: false })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
