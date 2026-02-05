import type { Request, Response, NextFunction } from "express";
import { getDatabase } from "../database/index.ts";
import {
  countUsers,
  findApiKeyUser,
  findSessionUser,
  touchApiKeyLastUsed,
} from "../database/queries/auth.ts";
import { hashApiKey, isApiKey } from "../utils/auth.ts";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";

export interface AuthenticatedUser {
  id: string;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return undefined;
}

async function resolveSession(token: string): Promise<AuthenticatedUser | null> {
  const db = getDatabase();
  const now = nowTs();
  const user = await findSessionUser(db, { sessionId: token, now });
  return user ? { id: user.userId, username: user.username } : null;
}

async function resolveApiKey(key: string): Promise<AuthenticatedUser | null> {
  const db = getDatabase();
  const keyHash = hashApiKey(key);
  const user = await findApiKeyUser(db, keyHash);

  if (!user) return null;

  // Update last_used_at asynchronously (don't block the request)
  touchApiKeyLastUsed(db, { apiKeyId: user.apiKeyId, lastUsedAt: nowTs() }).catch((err: unknown) =>
    logger.warn({ err }, "Failed to update api_key last_used_at"),
  );

  return { id: user.userId, username: user.username };
}

/**
 * Auth middleware. Requires a valid session token or API key in the
 * Authorization header. If no users exist yet (first-run), requests
 * are allowed through unauthenticated so the setup flow can work
 * (the actual registration requires a setup code).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (!token) {
    // Allow unauthenticated access when no users exist (setup mode)
    hasAnyUsers()
      .then((exists) => {
        if (!exists) {
          next();
          return;
        }
        res.status(401).json({ error: "Authentication required" });
      })
      .catch((err: unknown) => {
        logger.error({ err }, "Auth middleware error");
        res.status(500).json({ error: "Internal server error" });
      });
    return;
  }

  const resolve = isApiKey(token) ? resolveApiKey(token) : resolveSession(token);

  resolve
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      req.user = user;
      next();
    })
    .catch((err: unknown) => {
      logger.error({ err }, "Auth middleware error");
      res.status(500).json({ error: "Internal server error" });
    });
}

/**
 * Validate a token for WebSocket auth. Returns the user or null.
 */
export async function validateToken(token: string): Promise<AuthenticatedUser | null> {
  return isApiKey(token) ? resolveApiKey(token) : resolveSession(token);
}

/**
 * Check if any users have been registered.
 */
export async function hasAnyUsers(): Promise<boolean> {
  const db = getDatabase();
  return (await countUsers(db)) > 0;
}
