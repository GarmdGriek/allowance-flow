import { createAuthClient } from "better-auth/react";

// NEON_AUTH_URL is injected by vite.config.ts at build time
declare const __NEON_AUTH_URL__: string;

export const authClient = createAuthClient({
  baseURL: __NEON_AUTH_URL__,
});
