import { describe, expect, it } from "vitest";
import {
  canInvite,
  canInviteAs,
  canRemoveMember,
  canDeleteDocument,
  canDeleteWorkspace,
} from "./permissions.js";

describe("workspace permissions", () => {
  it("lets owners and admins invite, but not members", () => {
    expect(canInvite("OWNER")).toBe(true);
    expect(canInvite("ADMIN")).toBe(true);
    expect(canInvite("MEMBER")).toBe(false);
  });

  it("prevents inviting someone as owner", () => {
    expect(canInviteAs("OWNER", "OWNER")).toBe(false);
    expect(canInviteAs("ADMIN", "ADMIN")).toBe(false);
    expect(canInviteAs("ADMIN", "MEMBER")).toBe(true);
    expect(canInviteAs("OWNER", "ADMIN")).toBe(true);
  });

  it("never lets anyone remove the owner", () => {
    expect(canRemoveMember("OWNER", "OWNER")).toBe(false);
    expect(canRemoveMember("ADMIN", "OWNER")).toBe(false);
  });

  it("lets admins remove members but not other admins", () => {
    expect(canRemoveMember("ADMIN", "MEMBER")).toBe(true);
    expect(canRemoveMember("ADMIN", "ADMIN")).toBe(false);
    expect(canRemoveMember("OWNER", "ADMIN")).toBe(true);
  });

  it("lets owners/admins delete any document; members only their own", () => {
    expect(canDeleteDocument("MEMBER", true)).toBe(true);
    expect(canDeleteDocument("MEMBER", false)).toBe(false);
    expect(canDeleteDocument("ADMIN", false)).toBe(true);
  });

  it("only the owner can delete a workspace", () => {
    expect(canDeleteWorkspace("OWNER")).toBe(true);
    expect(canDeleteWorkspace("ADMIN")).toBe(false);
  });
});
