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
    // console.log("[auth] using JWT token"); // removed: avoid auth noise in prod
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
  return (session?.data as any)?.session?.token ?? null;
}

// Cache the JWT so we don't call /token on every single API request.
// JWTs from Neon Auth are short-lived (~5 min); cache for 4 min to stay safe.
let cachedJwt: string | null = null;
let cachedJwtExpiry = 0;
let jwtFetchPromise: Promise<string | null> | null = null;

/** Try to get a signed JWT from Neon Auth for backend validation via JWKS. */
async function tryGetJwt(): Promise<string | null> {
  // Return cached token if still valid
  if (cachedJwt && Date.now() < cachedJwtExpiry) return cachedJwt;

  // Deduplicate concurrent calls — only one fetch at a time
  if (!jwtFetchPromise) {
    jwtFetchPromise = (async () => {
      for (const endpoint of ["/token", "/get-jwt"]) {
        try {
          const res = await fetch(`${__NEON_AUTH_URL__}${endpoint}`, {
            method: "GET",
            credentials: "include",
          });
          const text = await res.text();
          if (res.ok && text) {
            const data = JSON.parse(text);
            const token: string | undefined = data?.token ?? data?.accessToken ?? data?.idToken;
            if (token && token.split(".").length === 3) {
              cachedJwt = token;
              cachedJwtExpiry = Date.now() + 4 * 60 * 1000; // 4 minutes
              return token;
            }
          }
        } catch { /* try next endpoint */ }
      }
      return null;
    })().finally(() => { jwtFetchPromise = null; });
  }

  return jwtFetchPromise;
}

/** Call this on sign-out to clear the cached JWT. */
export function clearJwtCache(): void {
  cachedJwt = null;
  cachedJwtExpiry = 0;
}
