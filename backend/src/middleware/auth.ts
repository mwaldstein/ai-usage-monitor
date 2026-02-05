import type { Request, Response, NextFunction } from "express";
import { getDatabase } from "../database/index.ts";
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

  const row = await db.get<{ user_id: string; username: string }>(
    `SELECT s.user_id, u.username
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
    [token, now],
  );

  return row ? { id: row.user_id, username: row.username } : null;
}

async function resolveApiKey(key: string): Promise<AuthenticatedUser | null> {
  const db = getDatabase();
  const keyHash = hashApiKey(key);

  const row = await db.get<{ user_id: string; username: string; key_id: string }>(
    `SELECT ak.id AS key_id, ak.user_id, u.username
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.key_hash = ?`,
    [keyHash],
  );

  if (!row) return null;

  // Update last_used_at asynchronously (don't block the request)
  db.run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", [nowTs(), row.key_id]).catch(
    (err: unknown) => logger.warn({ err }, "Failed to update api_key last_used_at"),
  );

  return { id: row.user_id, username: row.username };
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
  const row = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM users");
  return (row?.count ?? 0) > 0;
}
