import { createRateLimitMiddleware } from "../../middleware/rateLimit.ts";

export const registerRateLimit = createRateLimitMiddleware({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  keyPrefix: "auth-register",
  message: "Too many registration attempts. Please try again later.",
});

export const loginRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: "auth-login",
  message: "Too many login attempts. Please try again later.",
});
