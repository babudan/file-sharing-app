import sgMail from "@sendgrid/mail";
import { config } from "./config.js";

export type InviteEmailInput = {
  to: string;
  workspaceName: string;
  invitedByName: string;
  role: string;
  url: string;
  expiresAt: Date;
};

export type InviteEmailResult = {
  sent: boolean;
  skipped: boolean;
  error?: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export async function sendInvitationEmail(input: InviteEmailInput): Promise<InviteEmailResult> {
  if (!config.sendgrid.apiKey || !config.sendgrid.fromEmail) {
    return { sent: false, skipped: true };
  }

  sgMail.setApiKey(config.sendgrid.apiKey);
  const role = input.role.toLowerCase();
  const expires = input.expiresAt.toUTCString();
  const subject = `${input.invitedByName} invited you to ${input.workspaceName} on Ledger`;
  const text = [
    `${input.invitedByName} invited you to join “${input.workspaceName}” as a ${role}.`,
    "",
    `Open this link to accept (expires ${expires}):`,
    input.url,
    "",
    "Sign in or create an account with this same email address, then return to the link.",
  ].join("\n");
  const html = `
    <p>${escapeHtml(input.invitedByName)} invited you to join <strong>${escapeHtml(input.workspaceName)}</strong> as a ${escapeHtml(role)}.</p>
    <p><a href="${escapeHtml(input.url)}">Accept the invitation</a></p>
    <p>This link expires ${escapeHtml(expires)}. Use the same email address this message was sent to.</p>
  `;

  try {
    await sgMail.send({
      to: input.to,
      from: {
        email: config.sendgrid.fromEmail,
        name: config.sendgrid.fromName,
      },
      subject,
      text,
      html,
    });
    return { sent: true, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SendGrid request failed";
    console.error("SendGrid invite email failed:", message);
    return { sent: false, skipped: false, error: message };
  }
}
