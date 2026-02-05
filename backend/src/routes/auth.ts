import { Router } from "express";
import crypto from "crypto";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../database/index.ts";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  getSessionExpiryTs,
  generateApiKey,
  isApiKey,
  validateSetupCode,
  hasActiveSetupCode,
  generateSetupCode,
} from "../utils/auth.ts";
import { requireAuth, hasAnyUsers } from "../middleware/auth.ts";
import {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  MeResponse,
  AuthStatusResponse,
  ChangePasswordRequest,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  ListApiKeysResponse,
} from "shared/api";

const router = Router();

// GET /api/auth/status - public: check if setup is needed
router.get("/status", async (_req, res) => {
  try {
    const usersExist = await hasAnyUsers();
    res.json(S.encodeSync(AuthStatusResponse)({ enabled: true, hasUsers: usersExist }));
  } catch (err) {
    logger.error({ err }, "Error checking auth status");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const decoded = S.decodeUnknownEither(RegisterRequest)(req.body);
    if (Either.isLeft(decoded)) {
      res.status(400).json({ error: "Invalid request", details: decoded.left.message });
      return;
    }

    const { username, password, setupCode } = decoded.right;

    // Only allow registration if no users exist (first-run setup)
    const usersExist = await hasAnyUsers();
    if (usersExist) {
      res.status(403).json({ error: "Registration is closed. Contact an administrator." });
      return;
    }

    // Validate the setup code printed to backend logs
    if (!hasActiveSetupCode()) {
      // No setup code active -- generate a new one and tell user to check logs
      const newCode = generateSetupCode();
      logger.info("==========================================================");
      logger.info("  SETUP CODE REGENERATED");
      logger.info(`  Enter this code in the web UI to register: ${newCode}`);
      logger.info("==========================================================");
      res.status(403).json({
        error: "Setup code expired. A new code has been printed to the server logs.",
      });
      return;
    }

    if (!validateSetupCode(setupCode)) {
      res
        .status(403)
        .json({ error: "Invalid setup code. Check the server logs for the correct code." });
      return;
    }

    const db = getDatabase();

    // Check for duplicate username
    const existing = await db.get("SELECT id FROM users WHERE username = ?", [username]);
    if (existing) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const now = nowTs();

    await db.run(
      "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, username, passwordHash, now, now],
    );

    // Create session for the new user
    const token = generateSessionToken();
    const expiresAt = getSessionExpiryTs();

    await db.run("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [
      token,
      id,
      expiresAt,
      now,
    ]);

    logger.info({ username }, "First user registered successfully");

    res.status(201).json(
      S.encodeSync(AuthResponse)({
        token,
        user: { id, username },
      }),
    );
  } catch (err) {
    logger.error({ err }, "Error during registration");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const decoded = S.decodeUnknownEither(LoginRequest)(req.body);
    if (Either.isLeft(decoded)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const { username, password } = decoded.right;
    const db = getDatabase();

    const user = await db.get<{
      id: string;
      username: string;
      password_hash: string;
    }>("SELECT id, username, password_hash FROM users WHERE username = ?", [username]);

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const now = nowTs();
    const token = generateSessionToken();
    const expiresAt = getSessionExpiryTs();

    await db.run("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [
      token,
      user.id,
      expiresAt,
      now,
    ]);

    // Clean up expired sessions for this user
    await db.run("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?", [user.id, now]);

    logger.info({ username }, "User logged in");

    res.json(
      S.encodeSync(AuthResponse)({
        token,
        user: { id: user.id, username: user.username },
      }),
    );
  } catch (err) {
    logger.error({ err }, "Error during login");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.slice(7);
    if (token) {
      const db = getDatabase();
      await db.run("DELETE FROM sessions WHERE id = ?", [token]);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error during logout");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const db = getDatabase();
    const user = await db.get<{ id: string; username: string; created_at: number }>(
      "SELECT id, username, created_at FROM users WHERE id = ?",
      [req.user.id],
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(
      S.encodeSync(MeResponse)({
        id: user.id,
        username: user.username,
        createdAt: user.created_at,
      }),
    );
  } catch (err) {
    logger.error({ err }, "Error fetching user info");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/change-password
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const token = req.headers.authorization?.slice(7);
    if (!token || isApiKey(token)) {
      res.status(403).json({ error: "Password changes require a logged-in session" });
      return;
    }

    const decoded = S.decodeUnknownEither(ChangePasswordRequest)(req.body);
    if (Either.isLeft(decoded)) {
      res.status(400).json({ error: "Invalid request", details: decoded.left.message });
      return;
    }

    const { currentPassword, newPassword } = decoded.right;
    const db = getDatabase();

    const user = await db.get<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = ?",
      [req.user.id],
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const now = nowTs();
    const passwordHash = await hashPassword(newPassword);

    await db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [
      passwordHash,
      now,
      req.user.id,
    ]);

    // Revoke other sessions so the password update takes effect everywhere else.
    await db.run("DELETE FROM sessions WHERE user_id = ? AND id != ?", [req.user.id, token]);

    logger.info({ userId: req.user.id }, "User changed password");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error changing password");
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- API Keys ---

// GET /api/auth/api-keys
router.get("/api-keys", requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const db = getDatabase();
    const rows = await db.all<
      Array<{
        id: string;
        name: string;
        key_prefix: string;
        created_at: number;
        last_used_at: number | null;
      }>
    >(
      "SELECT id, name, key_prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id],
    );

    const keys = rows.map((row) => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));

    res.json(S.encodeSync(ListApiKeysResponse)(keys));
  } catch (err) {
    logger.error({ err }, "Error listing API keys");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/api-keys
router.post("/api-keys", requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const decoded = S.decodeUnknownEither(CreateApiKeyRequest)(req.body);
    if (Either.isLeft(decoded)) {
      res.status(400).json({ error: "Invalid request", details: decoded.left.message });
      return;
    }

    const { name } = decoded.right;
    const db = getDatabase();
    const id = crypto.randomUUID();
    const { key, keyHash, keyPrefix } = generateApiKey();
    const now = nowTs();

    await db.run(
      "INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, req.user.id, name, keyHash, keyPrefix, now],
    );

    logger.info({ userId: req.user.id, keyName: name }, "API key created");

    res.status(201).json(
      S.encodeSync(CreateApiKeyResponse)({
        id,
        name,
        key,
        keyPrefix,
        createdAt: now,
      }),
    );
  } catch (err) {
    logger.error({ err }, "Error creating API key");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/auth/api-keys/:id
router.delete("/api-keys/:id", requireAuth, async (req, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const db = getDatabase();
    const result = await db.run("DELETE FROM api_keys WHERE id = ? AND user_id = ?", [
      req.params.id,
      req.user.id,
    ]);

    if (!result.changes || result.changes === 0) {
      res.status(404).json({ error: "API key not found" });
      return;
    }

    logger.info({ userId: req.user.id, keyId: req.params.id }, "API key deleted");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error deleting API key");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
