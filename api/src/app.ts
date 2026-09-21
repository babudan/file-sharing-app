import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { documentRouter } from "./routes/documents.js";
import { publicRouter } from "./routes/public.js";
import { inviteRouter, workspaceRouter } from "./routes/workspaces.js";
import type { ObjectStorage } from "./storage.js";

export function createApp(storage: ObjectStorage) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 80,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/workspaces", workspaceRouter);
  app.use("/api/invites", inviteRouter);
  app.use("/api", documentRouter(storage));
  app.use("/api/public/shares", publicLimiter, publicRouter(storage));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: "bad_request", message: "Invalid request." });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "bad_request", message: "Invalid JSON body." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal", message: "Something went wrong." });
  });

  return app;
}
