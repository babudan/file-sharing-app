import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../asyncHandler.js";
import { clearSessionCookie, readUserFromRequest, requireUser, setSessionCookie } from "../auth.js";
import { loginUser, registerUser } from "../services/authService.js";
import { listPendingInvites } from "../services/workspaceService.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({
      error: "rate_limited",
      message: "Too many sign-in attempts. Wait a few minutes and try again.",
    });
  },
});

authRouter.post(
  "/register",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const user = await registerUser(req.body);
    setSessionCookie(res, user);
    res.status(201).json({ user });
  }),
);

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const user = await loginUser(req.body);
    setSessionCookie(res, user);
    res.json({ user });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get("/me", (req, res) => {
  const user = readUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "unauthorized", message: "Please sign in." });
    return;
  }
  res.json({ user });
});

authRouter.get(
  "/me/invites",
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const invitations = await listPendingInvites(user.email);
    res.json({ invitations });
  }),
);
