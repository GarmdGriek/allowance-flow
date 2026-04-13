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
      const text = await res.text();
      console.debug(`[auth] ${endpoint} → ${res.status} body=${text.slice(0, 300)}`);
      if (res.ok && text) {
        const data = JSON.parse(text);
        const token: string | undefined = data?.token ?? data?.accessToken ?? data?.idToken;
        // JWTs have exactly two dots (three segments)
        if (token && token.split(".").length === 3) {
          console.debug(`[auth] got JWT from ${endpoint}`);
          return token;
        }
        // Log all string fields so we can see what's actually in the response
        const stringFields = Object.entries(data ?? {})
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`);
        console.debug(`[auth] ${endpoint} string fields:`, stringFields);
      }
    } catch (e) {
      console.debug(`[auth] ${endpoint} error:`, e);
    }
  }
  return null;
}
