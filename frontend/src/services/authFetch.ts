const TOKEN_KEY = "aum_auth_token";

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Wrapper around fetch that automatically adds the auth token header
 * when one is stored. Also handles 401 responses by clearing auth state.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });

  // If we get a 401 and had a token, it's expired/invalid.
  // Clear it so the auth check re-triggers.
  if (response.status === 401 && token) {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem("aum_auth_user");
    } catch {
      // Storage unavailable
    }
    // Force reload to show login page
    window.location.reload();
  }

  return response;
}
