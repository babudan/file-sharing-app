import type { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AUTH_COOKIE, SHARE_UNLOCK_COOKIE, config } from "./config.js";
import { unauthorized } from "./errors.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

type SessionPayload = {
  sub: string;
  email: string;
  name: string;
};

type ShareUnlockPayload = {
  typ: "share";
  tok: string;
};

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function signSession(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name } satisfies SessionPayload,
    config.jwtSecret,
    { expiresIn: "7d" },
  );
}

export function setSessionCookie(res: Response, user: AuthUser): void {
  res.cookie(AUTH_COOKIE, signSession(user), cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
}

export function readUserFromRequest(req: Request): AuthUser | null {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as SessionPayload;
    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

export function requireUser(req: Request): AuthUser {
  const user = readUserFromRequest(req);
  if (!user) throw unauthorized("Please sign in.");
  return user;
}

export function setShareUnlockCookie(res: Response, shareToken: string): void {
  const token = jwt.sign(
    { typ: "share", tok: shareToken } satisfies ShareUnlockPayload,
    config.jwtSecret,
    { expiresIn: "2h" },
  );
  res.cookie(SHARE_UNLOCK_COOKIE, token, {
    ...cookieOptions(),
    maxAge: 2 * 60 * 60 * 1000,
  });
}

export function hasShareUnlock(req: Request, shareToken: string): boolean {
  const token = req.cookies?.[SHARE_UNLOCK_COOKIE];
  if (!token) return false;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as ShareUnlockPayload;
    return payload.typ === "share" && payload.tok === shareToken;
  } catch {
    return false;
  }
}
