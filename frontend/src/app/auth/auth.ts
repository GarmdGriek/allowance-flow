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
  const session = await authClient.getSession();
  // Better Auth stores the JWT access token on the session object
  return (session?.data as any)?.session?.token ?? null;
}
