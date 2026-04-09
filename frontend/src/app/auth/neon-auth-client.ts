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
