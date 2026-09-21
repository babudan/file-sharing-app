import type { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  canDeleteWorkspace,
  canInvite,
  canInviteAs,
  canRemoveMember,
} from "../domain/permissions.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { config } from "../config.js";
import { sendInvitationEmail } from "../mail.js";
import { normalizeEmail, randomToken } from "../utils.js";

async function membershipOrThrow(userId: string, workspaceId: string) {
  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: true },
  });
  if (!membership) throw notFound("Workspace not found.");
  return membership;
}

export async function listWorkspaces(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          _count: { select: { documents: { where: { deletedAt: null } }, memberships: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    isPersonal: m.workspace.isPersonal,
    role: m.role,
    documentCount: m.workspace._count.documents,
    memberCount: m.workspace._count.memberships,
    createdAt: m.workspace.createdAt,
  }));
}

export async function createWorkspace(userId: string, input: unknown) {
  const parsed = z.object({ name: z.string().min(1).max(80) }).safeParse(input);
  if (!parsed.success) throw badRequest("Workspace name is required.");

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: parsed.data.name.trim(),
        ownerId: userId,
        isPersonal: false,
      },
    });
    await tx.membership.create({
      data: { workspaceId: workspace.id, userId, role: "OWNER" },
    });
    return {
      id: workspace.id,
      name: workspace.name,
      isPersonal: workspace.isPersonal,
      role: "OWNER" as const,
    };
  });
}

export async function getWorkspace(userId: string, workspaceId: string) {
  const membership = await membershipOrThrow(userId, workspaceId);
  const [members, invitations, documents] = await Promise.all([
    prisma.membership.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.document.findMany({
      where: { workspaceId, deletedAt: null },
      include: { uploadedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    isPersonal: membership.workspace.isPersonal,
    role: membership.role,
    members: members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      joinedAt: m.createdAt,
    })),
    invitations: canInvite(membership.role)
      ? invitations.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          expiresAt: inv.expiresAt,
          url: `${config.publicAppUrl}/invites/${inv.token}`,
        }))
      : [],
    documents: documents.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt,
      uploadedBy: doc.uploadedBy,
    })),
  };
}

export async function inviteToWorkspace(userId: string, workspaceId: string, input: unknown) {
  const membership = await membershipOrThrow(userId, workspaceId);
  if (!canInvite(membership.role)) throw forbidden("You cannot invite people to this workspace.");
  if (membership.workspace.isPersonal) {
    throw badRequest("The personal workspace cannot have additional members. Create a team workspace instead.");
  }

  const parsed = z
    .object({
      email: z.string().email(),
      role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
    })
    .safeParse(input);
  if (!parsed.success) throw badRequest("A valid email is required.");
  if (!canInviteAs(membership.role, parsed.data.role as WorkspaceRole)) {
    throw forbidden("You cannot grant that role.");
  }

  const email = normalizeEmail(parsed.data.email);
  const existingMember = await prisma.membership.findFirst({
    where: { workspaceId, user: { email } },
  });
  if (existingMember) throw conflict("That person is already a member.");

  const existingInvite = await prisma.invitation.findFirst({
    where: { workspaceId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (existingInvite) throw conflict("An open invitation already exists for that email.");

  const invitation = await prisma.invitation.create({
    data: {
      workspaceId,
      email,
      role: parsed.data.role,
      token: randomToken(),
      invitedById: userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const url = `${config.publicAppUrl}/invites/${invitation.token}`;
  const inviter = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const emailResult = await sendInvitationEmail({
    to: email,
    workspaceName: membership.workspace.name,
    invitedByName: inviter?.name ?? "A teammate",
    role: invitation.role,
    url,
    expiresAt: invitation.expiresAt,
  });

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    url,
    emailSent: emailResult.sent,
    emailSkipped: emailResult.skipped,
  };
}

export async function getInvitationPreview(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { workspace: { select: { id: true, name: true } }, invitedBy: { select: { name: true } } },
  });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
    throw notFound("This invitation is invalid or has expired.");
  }
  return {
    email: invitation.email,
    role: invitation.role,
    workspaceName: invitation.workspace.name,
    invitedByName: invitation.invitedBy.name,
    expiresAt: invitation.expiresAt,
  };
}

export async function acceptInvitation(userId: string, userEmail: string, token: string) {
  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
    throw notFound("This invitation is invalid or has expired.");
  }
  if (normalizeEmail(userEmail) !== invitation.email) {
    throw forbidden("Sign in with the invited email address to accept this invitation.");
  }

  const already = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
  });
  if (already) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    return { workspaceId: invitation.workspaceId };
  }

  await prisma.$transaction([
    prisma.membership.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
      },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  return { workspaceId: invitation.workspaceId };
}

export async function removeMember(actorId: string, workspaceId: string, targetUserId: string) {
  const actor = await membershipOrThrow(actorId, workspaceId);
  const target = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!target) throw notFound("Member not found.");
  if (!canRemoveMember(actor.role, target.role)) {
    throw forbidden("You cannot remove that member.");
  }
  await prisma.membership.delete({ where: { id: target.id } });
}

export async function deleteWorkspace(userId: string, workspaceId: string) {
  const membership = await membershipOrThrow(userId, workspaceId);
  if (!canDeleteWorkspace(membership.role)) throw forbidden("Only the owner can delete this workspace.");
  if (membership.workspace.isPersonal) throw badRequest("The personal workspace cannot be deleted.");
  await prisma.workspace.delete({ where: { id: workspaceId } });
}

export async function listPendingInvites(email: string) {
  const invitations = await prisma.invitation.findMany({
    where: {
      email: normalizeEmail(email),
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { workspace: { select: { name: true } }, invitedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return invitations.map((inv) => ({
    token: inv.token,
    workspaceName: inv.workspace.name,
    invitedByName: inv.invitedBy.name,
    role: inv.role,
    expiresAt: inv.expiresAt,
  }));
}
