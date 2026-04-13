import { createAuthClient } from "better-auth/react";

// NEON_AUTH_URL is injected by vite.config.ts at build time
declare const __NEON_AUTH_URL__: string;

const getVerifier = (): string | null => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("neon_auth_session_verifier");
};

export const authClient = createAuthClient({
  baseURL: __NEON_AUTH_URL__,
  fetchOptions: {
    credentials: "include",
    onRequest: (ctx: any) => {
      const verifier = getVerifier();
      if (verifier && ctx.url) {
        try {
          const url = new URL(ctx.url);
          url.searchParams.set("neon_auth_session_verifier", verifier);
          ctx.url = url.toString();
        } catch {}
      }
    },
  },
});

/** Fetch a signed JWT from Neon Auth to use as a Bearer token for the backend. */
export async function getNeonJwt(): Promise<string | null> {
  try {
    // NEON_AUTH_URL already includes /auth, so /token gives .../auth/token
    const url = `${__NEON_AUTH_URL__}/token`;
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    console.debug("[auth] /token status:", res.status);
    if (!res.ok) {
      console.warn("[auth] /token returned", res.status);
      return null;
    }
    const data = await res.json();
    console.debug("[auth] /token response:", JSON.stringify(data));
    return data?.token ?? null;
  } catch (err) {
    console.warn("[auth] /token fetch error:", err);
    return null;
  }
}
