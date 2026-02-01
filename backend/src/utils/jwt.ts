/**
 * JWT parsing utilities
 *
 * Provides functions to parse JWT tokens and extract expiration time
 * without external dependencies (base64url decode only)
 */

export interface JWTClaims {
  exp?: number;
  iat?: number;
  sub?: string;
  iss?: string;
  aud?: string;
  [key: string]: unknown;
}

/**
 * Parse a JWT token and return the claims
 * Returns null if the token is invalid or cannot be parsed
 */
export function parseJWT(token: string): JWTClaims | null {
  try {
    // JWT tokens have 3 parts: header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    if (!payload) {
      return null;
    }

    // Base64url decode the payload
    const decoded = base64UrlDecode(payload);
    if (!decoded) {
      return null;
    }

    const claims = JSON.parse(decoded) as JWTClaims;
    return claims;
  } catch {
    return null;
  }
}

/**
 * Extract expiration timestamp from a JWT token
 * Returns null if the token is invalid or has no expiration
 */
export function getJWTExpiration(token: string): number | null {
  const claims = parseJWT(token);
  if (!claims?.exp) {
    return null;
  }
  return claims.exp;
}

/**
 * Check if a JWT token is expired
 * Returns true if expired or invalid, false if still valid
 */
export function isJWTExpired(token: string, now: number = Date.now() / 1000): boolean {
  const exp = getJWTExpiration(token);
  if (!exp) {
    return false; // No expiration = not expired
  }
  return exp < now;
}

/**
 * Get time until JWT expiration in seconds
 * Returns null if no expiration or token is invalid
 * Returns negative number if already expired
 */
export function getJWTTimeUntilExpiration(
  token: string,
  now: number = Date.now() / 1000,
): number | null {
  const exp = getJWTExpiration(token);
  if (!exp) {
    return null;
  }
  return exp - now;
}

/**
 * Base64url decode a string
 * Handles the JWT-specific base64url encoding (no padding, - instead of +, _ instead of /)
 */
function base64UrlDecode(str: string): string | null {
  try {
    // Convert base64url to standard base64
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");

    // Add padding if needed
    const padding = 4 - (base64.length % 4);
    if (padding !== 4) {
      base64 += "=".repeat(padding);
    }

    // Decode using Node's Buffer
    const buffer = Buffer.from(base64, "base64");
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}
