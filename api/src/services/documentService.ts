import { prisma } from "../db.js";
import { buildStorageKey, isAllowedUpload, sanitizeFilename } from "../domain/files.js";
import { canDeleteDocument } from "../domain/permissions.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import type { ObjectStorage } from "../storage.js";
import { config } from "../config.js";

async function requireMember(userId: string, workspaceId: string) {
  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) throw notFound("Workspace not found.");
  return membership;
}

export async function uploadDocument(
  storage: ObjectStorage,
  userId: string,
  workspaceId: string,
  file: Express.Multer.File | undefined,
) {
  await requireMember(userId, workspaceId);
  if (!file) throw badRequest("A file is required.");
  if (file.size > config.maxFileBytes) {
    throw badRequest(`Files must be ${Math.floor(config.maxFileBytes / (1024 * 1024))}MB or smaller.`);
  }
  if (!isAllowedUpload(file.originalname, file.mimetype)) {
    throw badRequest("That file type is not allowed.");
  }

  const filename = sanitizeFilename(file.originalname);
  const document = await prisma.document.create({
    data: {
      workspaceId,
      uploadedById: userId,
      filename,
      mimeType: file.mimetype || "application/octet-stream",
      sizeBytes: file.size,
      storageKey: "pending",
    },
  });

  const storageKey = buildStorageKey(workspaceId, document.id, filename);
  try {
    await storage.put(storageKey, file.buffer, document.mimeType);
    return prisma.document.update({
      where: { id: document.id },
      data: { storageKey },
    });
  } catch (err) {
    await prisma.document.delete({ where: { id: document.id } });
    throw err;
  }
}

export async function getDocumentForMember(userId: string, documentId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { uploadedBy: { select: { id: true, name: true, email: true } } },
  });
  if (!document || document.deletedAt) throw notFound("Document not found.");
  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: document.workspaceId, userId } },
  });
  if (!membership) throw notFound("Document not found.");
  return { document, membership };
}

export async function deleteDocument(storage: ObjectStorage, userId: string, documentId: string) {
  const { document, membership } = await getDocumentForMember(userId, documentId);
  if (!canDeleteDocument(membership.role, document.uploadedById === userId)) {
    throw forbidden("You cannot delete this document.");
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { deletedAt: new Date() },
  });

  try {
    await storage.delete(document.storageKey);
  } catch {
    // Soft-deleted row remains; object cleanup can be retried later.
  }
}
