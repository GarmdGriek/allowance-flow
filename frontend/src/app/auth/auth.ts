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
  console.debug("[auth] full session response:", JSON.stringify(session));
  // Better Auth/Neon Auth stores the JWT token on session.data.session.token
  const token = (session?.data as any)?.session?.token ?? null;
  console.debug("[auth] extracted token:", token ? token.substring(0, 20) + "..." : null);
  return token;
}
