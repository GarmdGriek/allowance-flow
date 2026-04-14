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
  // Try JWT first — the /token fetch only uses cookies and is safe during the
  // OAuth callback (it does NOT consume the neon_auth_session_verifier).
  const jwt = await tryGetJwt();
  if (jwt) {
    console.log("[auth] using JWT token");
    return jwt;
  }

  // Only call authClient.getSession() after the OAuth callback is done.
  // authClient.getSession() can trigger interceptors that append the verifier
  // to the request URL, consuming it before UserGuard's refetch() can use it.
  if (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("neon_auth_session_verifier")) {
    return null;
  }

  // Fall back to opaque session token
  const session = await authClient.getSession();
  if (session?.data) {
    console.log("[auth] full session data:", JSON.stringify(session.data));
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
      console.log(`[auth] ${endpoint} → ${res.status} body=${text.slice(0, 300)}`);
      if (res.ok && text) {
        const data = JSON.parse(text);
        const token: string | undefined = data?.token ?? data?.accessToken ?? data?.idToken;
        // JWTs have exactly two dots (three segments)
        if (token && token.split(".").length === 3) {
          console.log(`[auth] got JWT from ${endpoint}`);
          return token;
        }
        // Log all string fields so we can see what's actually in the response
        const stringFields = Object.entries(data ?? {})
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`);
        console.log(`[auth] ${endpoint} string fields:`, stringFields);
      }
    } catch (e) {
      console.log(`[auth] ${endpoint} error:`, e);
    }
  }
  return null;
}
