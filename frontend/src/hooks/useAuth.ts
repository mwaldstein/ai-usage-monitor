import { useState, useEffect, useCallback } from "react";
import { Schema as S, Either } from "effect";
import { getApiBaseUrl } from "../services/backendUrls";
import { AuthStatusResponse, AuthResponse } from "shared/api";

const API_URL = getApiBaseUrl();
const TOKEN_KEY = "aum_auth_token";
const USER_KEY = "aum_auth_user";

export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthState {
  /** Whether auth is enabled on the server */
  authEnabled: boolean;
  /** Whether the server has any registered users */
  hasUsers: boolean;
  /** Whether we're currently checking auth status */
  loading: boolean;
  /** The authenticated user, if any */
  user: AuthUser | null;
  /** Auth token for API calls */
  token: string | null;
  /** Login with username/password */
  login: (username: string, password: string) => Promise<string | null>;
  /** Register a new account (first-run only, requires setup code from server logs) */
  register: (username: string, password: string, setupCode: string) => Promise<string | null>;
  /** Log out and clear session */
  logout: () => Promise<void>;
  /** Change password for the current user */
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
}

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function saveAuth(token: string, user: AuthUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable
  }
}

function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Storage unavailable
  }
}

export function useAuth(): AuthState {
  const [authEnabled, setAuthEnabled] = useState(false);
  const [hasUsers, setHasUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(loadToken);
  const [user, setUser] = useState<AuthUser | null>(loadUser);

  // Check auth status on mount
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/status`);
        if (!response.ok) {
          // If auth endpoint doesn't exist, auth is disabled
          setAuthEnabled(false);
          setLoading(false);
          return;
        }
        const data: unknown = await response.json();
        const decoded = S.decodeUnknownEither(AuthStatusResponse)(data);
        if (Either.isLeft(decoded)) {
          setAuthEnabled(false);
          setLoading(false);
          return;
        }
        if (!cancelled) {
          setAuthEnabled(decoded.right.enabled);
          setHasUsers(decoded.right.hasUsers);

          // If we have a stored token, validate it
          if (token) {
            const meResponse = await fetch(`${API_URL}/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!meResponse.ok) {
              // Token invalid/expired
              clearAuth();
              setToken(null);
              setUser(null);
            }
          }

          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAuthEnabled(false);
          setLoading(false);
        }
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        return body.error ?? "Login failed";
      }

      const data: unknown = await response.json();
      const decoded = S.decodeUnknownEither(AuthResponse)(data);
      if (Either.isLeft(decoded)) {
        return "Invalid response from server";
      }

      const { token: newToken, user: newUser } = decoded.right;
      saveAuth(newToken, newUser);
      setToken(newToken);
      setUser(newUser);
      setHasUsers(true);
      return null;
    } catch {
      return "Network error";
    }
  }, []);

  const register = useCallback(
    async (username: string, password: string, setupCode: string): Promise<string | null> => {
      try {
        const response = await fetch(`${API_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, setupCode }),
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          return body.error ?? "Registration failed";
        }

        const data: unknown = await response.json();
        const decoded = S.decodeUnknownEither(AuthResponse)(data);
        if (Either.isLeft(decoded)) {
          return "Invalid response from server";
        }

        const { token: newToken, user: newUser } = decoded.right;
        saveAuth(newToken, newUser);
        setToken(newToken);
        setUser(newUser);
        setHasUsers(true);
        return null;
      } catch {
        return "Network error";
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Ignore network errors on logout
      }
    }
    clearAuth();
    setToken(null);
    setUser(null);
  }, [token]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<string | null> => {
      if (!token) {
        return "Not authenticated";
      }

      try {
        const response = await fetch(`${API_URL}/auth/change-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          return body.error ?? "Password change failed";
        }

        return null;
      } catch {
        return "Network error";
      }
    },
    [token],
  );

  return {
    authEnabled,
    hasUsers,
    loading,
    user,
    token,
    login,
    register,
    logout,
    changePassword,
  };
}
