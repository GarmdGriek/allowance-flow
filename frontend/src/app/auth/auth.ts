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
  // Send the opaque session token — the backend validates it via Neon Auth's session endpoint
  return (session?.data as any)?.session?.token ?? null;
}
