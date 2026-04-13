import { authClient } from "./neon-auth-client";

declare const __NEON_AUTH_URL__: string;

export const auth = {
  getAuthHeaderValue: async (): Promise<string> => {
    const token = await getAccessToken();
    return token ? `Bearer ${token}` : "";
  },
  getAuthToken: async (): Promise<string> => {
    return (await getAccessToken()) ?? "";
  },
};

async function getAccessToken(): Promise<string | null> {
  // Don't touch authClient during OAuth callback — the verifier is one-time-use
  // and consuming it here prevents UserGuard from establishing the session.
  if (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("neon_auth_session_verifier")) {
    return null;
  }

  // Try to get a JWT first (Better Auth JWT plugin, validated by JWKS on backend).
  // GET /token is the standard Better Auth JWT plugin endpoint.
  const jwt = await tryGetJwt();
  if (jwt) {
    console.debug("[auth] using JWT token");
    return jwt;
  }

  // Fall back to opaque session token
  const session = await authClient.getSession();
  if (session?.data) {
    console.debug("[auth] full session data:", JSON.stringify(session.data));
  }
  return (session?.data as any)?.session?.token ?? null;
}

/** Try to get a signed JWT from Neon Auth for backend validation via JWKS. */
async function tryGetJwt(): Promise<string | null> {
  const endpoints = ["/token", "/get-jwt"];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${__NEON_AUTH_URL__}${endpoint}`, {
        method: "GET",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const token: string | undefined = data?.token ?? data?.accessToken ?? data?.idToken;
        // JWTs have two dots; opaque tokens don't
        if (token && token.split(".").length === 3) {
          console.debug(`[auth] got JWT from ${endpoint}`);
          return token;
        }
      } else {
        console.debug(`[auth] ${endpoint} → ${res.status}`);
      }
    } catch {
      // endpoint not available
    }
  }
  return null;
}
