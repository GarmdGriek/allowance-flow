import { auth } from "app/auth";
import { authClient } from "app/auth/neon-auth-client";
import { API_URL } from "../constants";
import { Apiclient } from "./Apiclient";
import type { RequestParams } from "./http-client";

const constructBaseUrl = (): string => {
  // If running locally, fall back to localhost
  if (!API_URL || API_URL === "undefined") {
    return window.location.origin;
  }
  return API_URL;
};

type BaseApiParams = Omit<RequestParams, "signal" | "baseUrl" | "cancelToken">;

const constructBaseApiParams = (): BaseApiParams => {
  return {
    credentials: "include",
    secure: true,
  };
};

// Singleton refresh: all concurrent 401s share one getSession call (prevents 429 spam)
let tokenRefreshPromise: Promise<string | null> | null = null;

/**
 * Fetch wrapper that handles 401 responses by forcing a fresh session check.
 * - Uses a singleton refresh promise so parallel 401s don't hammer Neon Auth.
 * - Guards against redirect loops by doing nothing when already on /auth pages.
 * - If the session is genuinely expired, signs the user out and redirects to login.
 */
const fetchWithAuthRetry = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const response = await fetch(url, options);

  if (response.status !== 401) return response;

  // Don't trigger sign-out while on auth pages or during OAuth callback (verifier in URL)
  // The verifier is one-time-use — consuming it here breaks UserGuard's session setup
  if (
    window.location.pathname.startsWith("/auth") ||
    new URLSearchParams(window.location.search).has("neon_auth_session_verifier")
  ) {
    return response;
  }

  // Only one refresh attempt at a time; reset after 10 s to allow future retries
  if (!tokenRefreshPromise) {
    tokenRefreshPromise = (authClient.getSession({ fetchOptions: { cache: "no-store" } } as any) as Promise<any>)
      .then((s: any) => (s?.data as any)?.session?.token ?? null)
      .catch(() => null)
      .finally(() => { setTimeout(() => { tokenRefreshPromise = null; }, 10_000); });
  }

  const freshToken = await tokenRefreshPromise;

  if (!freshToken) {
    console.warn("[auth] Session expired, signing out");
    await authClient.signOut().catch(() => {});
    window.location.href = "/auth/sign-in";
    return response;
  }

  // Retry the original request once with the fresh token
  return fetch(url, {
    ...options,
    headers: { ...(options?.headers ?? {}), Authorization: `Bearer ${freshToken}` },
  });
};

const constructClient = () => {
  const baseUrl = constructBaseUrl();
  const baseApiParams = constructBaseApiParams();

  console.debug(`Baseurl for API client: ${baseUrl}`);

  return new Apiclient({
    baseUrl,
    baseApiParams,
    customFetch: fetchWithAuthRetry,
    securityWorker: async () => {
      return {
        headers: {
          Authorization: await auth.getAuthHeaderValue(),
        },
      };
    },
  });
};

const apiclient = constructClient();

export default apiclient;
