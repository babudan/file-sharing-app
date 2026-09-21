import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../asyncHandler.js";
import { hasShareUnlock, setShareUnlockCookie } from "../auth.js";
import { badRequest } from "../errors.js";
import {
  consumePublicShare,
  getPublicShare,
  unlockPublicShare,
} from "../services/shareService.js";
import type { ObjectStorage } from "../storage.js";
import { contentDisposition } from "../utils.js";

export function publicRouter(storage: ObjectStorage): Router {
  const router = Router();

  router.get(
    "/:token",
    asyncHandler(async (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const share = await getPublicShare(req.params.token, hasShareUnlock(req, req.params.token));
      res.json({ share });
    }),
  );

  router.post(
    "/:token/unlock",
    asyncHandler(async (req, res) => {
      const parsed = z.object({ password: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) throw badRequest("Password is required.");
      await unlockPublicShare(req.params.token, parsed.data.password);
      setShareUnlockCookie(res, req.params.token);
      const share = await getPublicShare(req.params.token, true);
      res.json({ share });
    }),
  );

  router.get(
    "/:token/download",
    asyncHandler(async (req, res) => {
      const document = await consumePublicShare(
        req.params.token,
        hasShareUnlock(req, req.params.token),
      );
      const stream = await storage.getStream(document.storageKey);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Length", String(document.sizeBytes));
      res.setHeader("Content-Disposition", contentDisposition(document.filename));
      res.setHeader("X-Content-Type-Options", "nosniff");
      stream.on("error", () => {
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      });
      stream.pipe(res);
    }),
  );

  return router;
}
