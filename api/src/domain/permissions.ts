import type { WorkspaceRole } from "@prisma/client";

export function canInvite(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canManageAdmins(role: WorkspaceRole): boolean {
  return role === "OWNER";
}

export function canRemoveMember(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (target === "OWNER") return false;
  if (actor === "OWNER") return true;
  if (actor === "ADMIN" && target === "MEMBER") return true;
  return false;
}

export function canDeleteWorkspace(role: WorkspaceRole): boolean {
  return role === "OWNER";
}

export function canDeleteDocument(role: WorkspaceRole, isUploader: boolean): boolean {
  return role === "OWNER" || role === "ADMIN" || isUploader;
}

export function canCreateShare(_role: WorkspaceRole): boolean {
  return true;
}

export function canInviteAs(actor: WorkspaceRole, invitedRole: WorkspaceRole): boolean {
  if (invitedRole === "OWNER") return false;
  if (actor === "OWNER") return invitedRole === "ADMIN" || invitedRole === "MEMBER";
  if (actor === "ADMIN") return invitedRole === "MEMBER";
  return false;
}
