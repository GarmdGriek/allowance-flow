import { authClient } from "./neon-auth-client";

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
  try {
    // Neon Auth (Better Auth) issues JWTs via the /token endpoint.
    // The session cookie is sent automatically; the response contains a signed JWT
    // that the backend validates against the JWKS URL.
    const response = await authClient.$fetch<{ token: string }>("/token");
    const token = (response as any)?.token ?? null;
    return token;
  } catch (err) {
    console.warn("[auth] failed to fetch JWT token:", err);
    return null;
  }
}
