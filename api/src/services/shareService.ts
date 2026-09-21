import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { canCreateShare } from "../domain/permissions.js";
import {
  evaluateShareAccess,
  shareDenialMessage,
  shareDenialStatus,
  type ShareState,
} from "../domain/shareAccess.js";
import { badRequest, forbidden, HttpError, notFound } from "../errors.js";
import { config } from "../config.js";
import { randomToken } from "../utils.js";
import { getDocumentForMember } from "./documentService.js";

function toShareState(share: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
  passwordHash: string | null;
  document: { deletedAt: Date | null };
}): ShareState {
  return {
    revokedAt: share.revokedAt,
    expiresAt: share.expiresAt,
    maxDownloads: share.maxDownloads,
    downloadCount: share.downloadCount,
    documentDeleted: Boolean(share.document.deletedAt),
    hasPassword: Boolean(share.passwordHash),
  };
}

export async function createShareLink(userId: string, documentId: string, input: unknown) {
  const { document, membership } = await getDocumentForMember(userId, documentId);
  if (!canCreateShare(membership.role)) throw forbidden("You cannot share this document.");

  const optionalPositiveInt = z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z.coerce.number().int().positive().max(10_000).optional(),
  );
  const optionalExpiryHours = z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z.coerce.number().int().positive().max(24 * 90).optional(),
  );
  const parsed = z
    .object({
      expiresInHours: optionalExpiryHours,
      maxDownloads: optionalPositiveInt,
      password: z.preprocess(
        (value) => (value === null || value === "" ? undefined : value),
        z.string().min(4).max(72).optional(),
      ),
    })
    .safeParse(input ?? {});
  if (!parsed.success) {
    throw badRequest("Share options are invalid. Use a number for expiry and max downloads; password must be at least 4 characters.");
  }

  const passwordHash = parsed.data.password
    ? await bcrypt.hash(parsed.data.password, 12)
    : null;

  const share = await prisma.shareLink.create({
    data: {
      documentId: document.id,
      createdById: userId,
      token: randomToken(),
      expiresAt: parsed.data.expiresInHours
        ? new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000)
        : null,
      maxDownloads: parsed.data.maxDownloads ?? null,
      passwordHash,
    },
  });

  return serializeShare(share);
}

export async function listShareLinks(userId: string, documentId: string) {
  await getDocumentForMember(userId, documentId);
  const shares = await prisma.shareLink.findMany({
    where: { documentId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return shares.map(serializeShare);
}

export async function revokeShareLink(userId: string, shareId: string) {
  const share = await prisma.shareLink.findUnique({
    where: { id: shareId },
    include: { document: true },
  });
  if (!share || share.document.deletedAt) throw notFound("Share link not found.");
  await getDocumentForMember(userId, share.documentId);
  if (share.revokedAt) return;
  await prisma.shareLink.update({
    where: { id: share.id },
    data: { revokedAt: new Date() },
  });
}

function serializeShare(share: {
  id: string;
  token: string;
  expiresAt: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
  passwordHash: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}) {
  return {
    id: share.id,
    url: `${config.publicAppUrl}/s/${share.token}`,
    expiresAt: share.expiresAt,
    maxDownloads: share.maxDownloads,
    downloadCount: share.downloadCount,
    hasPassword: Boolean(share.passwordHash),
    createdAt: share.createdAt,
    revokedAt: share.revokedAt,
  };
}

export async function getPublicShare(token: string, unlocked: boolean) {
  const share = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      document: {
        select: {
          id: true,
          filename: true,
          sizeBytes: true,
          mimeType: true,
          deletedAt: true,
        },
      },
    },
  });
  const access = evaluateShareAccess(share ? toShareState(share) : null, { unlocked });
  if (!access.ok && access.reason !== "password_required") {
    throw new HttpError(shareDenialStatus(access.reason), shareDenialMessage(access.reason), access.reason);
  }
  if (access.ok === false && access.reason === "password_required") {
    return {
      id: share!.id,
      requiresPassword: true,
      unlocked: false,
      filename: null,
      sizeBytes: null,
      mimeType: null,
      expiresAt: share!.expiresAt,
      maxDownloads: share!.maxDownloads,
      downloadCount: share!.downloadCount,
    };
  }
  return {
    id: share!.id,
    requiresPassword: Boolean(share!.passwordHash),
    unlocked: true,
    filename: share!.document.filename,
    sizeBytes: share!.document.sizeBytes,
    mimeType: share!.document.mimeType,
    expiresAt: share!.expiresAt,
    maxDownloads: share!.maxDownloads,
    downloadCount: share!.downloadCount,
  };
}

export async function unlockPublicShare(token: string, password: string) {
  const share = await prisma.shareLink.findUnique({
    where: { token },
    include: { document: { select: { deletedAt: true } } },
  });
  const access = evaluateShareAccess(share ? toShareState(share) : null, { unlocked: true });
  if (!access.ok && access.reason !== "password_required") {
    throw new HttpError(shareDenialStatus(access.reason), shareDenialMessage(access.reason), access.reason);
  }
  if (!share?.passwordHash) return;
  const ok = await bcrypt.compare(password, share.passwordHash);
  if (!ok) throw forbidden("Incorrect password.");
}

export async function consumePublicShare(token: string, unlocked: boolean) {
  const share = await prisma.shareLink.findUnique({
    where: { token },
    include: { document: true },
  });
  const access = evaluateShareAccess(share ? toShareState(share) : null, { unlocked });
  if (!access.ok) {
    throw new HttpError(shareDenialStatus(access.reason), shareDenialMessage(access.reason), access.reason);
  }

  const updated = await prisma.shareLink.updateMany({
    where: {
      id: share!.id,
      revokedAt: null,
      ...(share!.maxDownloads === null ? {} : { downloadCount: { lt: share!.maxDownloads } }),
    },
    data: { downloadCount: { increment: 1 } },
  });
  if (updated.count !== 1) {
    throw new HttpError(410, "This share link has reached its download limit.", "download_limit");
  }

  return share!.document;
}
