import type { Request, Response } from "express";
import type { AuthenticatedUser } from "../../middleware/auth.ts";

export function getBearerToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  return authorization.slice(7);
}

export function requireRequestUser(req: Request, res: Response): AuthenticatedUser | null {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  return req.user;
}
