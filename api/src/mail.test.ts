import { describe, expect, it } from "vitest";
import { sendInvitationEmail } from "./mail.js";

describe("sendInvitationEmail", () => {
  it("skips sending when SendGrid is not configured", async () => {
    const result = await sendInvitationEmail({
      to: "a@example.com",
      workspaceName: "Design",
      invitedByName: "Alice",
      role: "MEMBER",
      url: "http://localhost:8080/invites/token",
      expiresAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result.sent).toBe(false);
    expect(result.skipped).toBe(true);
  });
});
