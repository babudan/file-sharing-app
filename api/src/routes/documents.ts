import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../asyncHandler.js";
import { requireUser } from "../auth.js";
import { config } from "../config.js";
import { badRequest } from "../errors.js";
import { deleteDocument, getDocumentForMember, uploadDocument } from "../services/documentService.js";
import { createShareLink, listShareLinks, revokeShareLink } from "../services/shareService.js";
import type { ObjectStorage } from "../storage.js";
import { contentDisposition } from "../utils.js";

export function documentRouter(storage: ObjectStorage): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxFileBytes, files: 1 },
  });

  router.post(
    "/workspaces/:workspaceId/documents",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const user = requireUser(req);
      const document = await uploadDocument(storage, user.id, req.params.workspaceId, req.file);
      res.status(201).json({
        document: {
          id: document.id,
          filename: document.filename,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          createdAt: document.createdAt,
        },
      });
    }),
  );

  router.get(
    "/documents/:documentId",
    asyncHandler(async (req, res) => {
      const user = requireUser(req);
      const { document } = await getDocumentForMember(user.id, req.params.documentId);
      res.json({
        document: {
          id: document.id,
          workspaceId: document.workspaceId,
          filename: document.filename,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          createdAt: document.createdAt,
          uploadedBy: document.uploadedBy,
        },
      });
    }),
  );

  router.get(
    "/documents/:documentId/download",
    asyncHandler(async (req, res) => {
      const user = requireUser(req);
      const { document } = await getDocumentForMember(user.id, req.params.documentId);
      const stream = await storage.getStream(document.storageKey);
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Disposition", contentDisposition(document.filename));
      res.setHeader("X-Content-Type-Options", "nosniff");
      stream.pipe(res);
    }),
  );

  router.delete(
    "/documents/:documentId",
    asyncHandler(async (req, res) => {
      const user = requireUser(req);
      await deleteDocument(storage, user.id, req.params.documentId);
      res.status(204).end();
    }),
  );

  router.post(
    "/documents/:documentId/shares",
    asyncHandler(async (req, res) => {
      const user = requireUser(req);
      const share = await createShareLink(user.id, req.params.documentId, req.body);
      res.status(201).json({ share });
    }),
  );

  router.get(
    "/documents/:documentId/shares",
    asyncHandler(async (req, res) => {
      const user = requireUser(req);
      const shares = await listShareLinks(user.id, req.params.documentId);
      res.json({ shares });
    }),
  );

  router.delete(
    "/shares/:shareId",
    asyncHandler(async (req, res) => {
      const user = requireUser(req);
      await revokeShareLink(user.id, req.params.shareId);
      res.status(204).end();
    }),
  );

  router.use((err: unknown, _req: unknown, _res: unknown, next: (error?: unknown) => void) => {
    if (err instanceof multer.MulterError) {
      next(badRequest(err.code === "LIMIT_FILE_SIZE" ? "File is too large." : err.message));
      return;
    }
    next(err);
  });

  return router;
}
