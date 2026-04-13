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
    // Get the opaque session token first
    const session = await authClient.getSession();
    const sessionToken = (session?.data as any)?.session?.token ?? null;
    if (!sessionToken) {
      console.warn("[auth] no session token available");
      return null;
    }

    // Exchange session token for a signed JWT via Neon Auth's /token endpoint
    const url = `${__NEON_AUTH_URL__}/token`;
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sessionToken}`,
      },
    });
    console.debug("[auth] /token status:", res.status);
    if (!res.ok) {
      const body = await res.text();
      console.warn("[auth] /token error body:", body);
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
