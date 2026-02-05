import type { Request, RequestHandler, Response } from "express";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  message: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const DEFAULT_MESSAGE = "Too many requests. Please try again later.";

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function sendRateLimitResponse(res: Response, message: string, resetAt: number, now: number): void {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({ error: message });
}

export function createRateLimitMiddleware(options: Partial<RateLimitOptions>): RequestHandler {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxRequests = options.maxRequests ?? 10;
  const keyPrefix = options.keyPrefix ?? "default";
  const message = options.message ?? DEFAULT_MESSAGE;
  const entries = new Map<string, RateLimitEntry>();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${getClientIp(req)}`;
    const current = entries.get(key);

    if (!current || current.resetAt <= now) {
      entries.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= maxRequests) {
      sendRateLimitResponse(res, message, current.resetAt, now);
      return;
    }

    current.count += 1;
    next();
  };
}
