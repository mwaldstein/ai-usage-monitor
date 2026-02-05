import crypto from "crypto";
import { getEnv } from "../schemas/env.ts";

const SCRYPT_KEYLEN = 64;
const SALT_LENGTH = 16;
const SESSION_TOKEN_LENGTH = 32;
const API_KEY_LENGTH = 32;
const API_KEY_PREFIX = "aum_";
const SESSION_EXPIRY_HOURS = 168; // 7 days
const SETUP_CODE_LENGTH = 6;

// --- Setup code (one-time registration secret) ---

let currentSetupCode: string | null = null;

/** Generate a new setup code and return it. */
export function generateSetupCode(): string {
  // 6-character alphanumeric code (uppercase for readability)
  const bytes = crypto.randomBytes(SETUP_CODE_LENGTH);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  let code = "";
  for (let i = 0; i < SETUP_CODE_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  currentSetupCode = code;
  return code;
}

/** Validate a setup code. Returns true and clears the code on success. */
export function validateSetupCode(code: string): boolean {
  if (!currentSetupCode) return false;
  const valid = crypto.timingSafeEqual(
    Buffer.from(code.toUpperCase()),
    Buffer.from(currentSetupCode),
  );
  if (valid) {
    currentSetupCode = null; // one-time use
  }
  return valid;
}

/** Check if a setup code is currently active. */
export function hasActiveSetupCode(): boolean {
  return currentSetupCode !== null;
}

// --- Password hashing (scrypt) ---

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    if (!salt || !key) {
      resolve(false);
      return;
    }
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(crypto.timingSafeEqual(Buffer.from(key, "hex"), derivedKey));
    });
  });
}

// --- Session tokens ---

export function generateSessionToken(): string {
  const env = getEnv();
  const random = crypto.randomBytes(SESSION_TOKEN_LENGTH).toString("hex");
  if (env.authSecret) {
    const hmac = crypto.createHmac("sha256", env.authSecret).update(random).digest("hex");
    return `${random}.${hmac}`;
  }
  return random;
}

export function getSessionExpiryTs(): number {
  return Math.floor(Date.now() / 1000) + SESSION_EXPIRY_HOURS * 3600;
}

// --- API keys ---

export function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const random = crypto.randomBytes(API_KEY_LENGTH).toString("hex");
  const key = `${API_KEY_PREFIX}${random}`;
  const keyPrefix = `${API_KEY_PREFIX}${random.slice(0, 8)}...`;
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, keyHash, keyPrefix };
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function isApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}
