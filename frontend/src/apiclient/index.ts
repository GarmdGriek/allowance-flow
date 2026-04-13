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

/**
 * Fetch wrapper that handles 401 responses by forcing a fresh session check.
 * If the session is genuinely expired, signs the user out and redirects to login.
 */
const fetchWithAuthRetry = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const response = await fetch(url, options);

  if (response.status === 401) {
    // Force a fresh session fetch (bypasses in-memory cache)
    const freshSession = await authClient.getSession({ fetchOptions: { cache: "no-store" } } as any);

    if (!freshSession?.data) {
      // Session is genuinely gone — sign out and redirect to login
      console.warn("[auth] Session expired, signing out");
      await authClient.signOut();
      window.location.href = "/auth/sign-in";
      return response;
    }

    const freshToken = (freshSession.data as any)?.session?.token;
    if (freshToken) {
      // Retry the original request once with the fresh token
      const retryOptions: RequestInit = {
        ...options,
        headers: {
          ...(options?.headers ?? {}),
          Authorization: `Bearer ${freshToken}`,
        },
      };
      return fetch(url, retryOptions);
    }
  }

  return response;
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
