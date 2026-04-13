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
  // Log full session structure once to help debug token format
  if (session?.data) {
    console.debug("[auth] full session data:", JSON.stringify(session.data));
  }
  // Send the opaque session token — the backend validates it via Neon Auth's session endpoint
  return (session?.data as any)?.session?.token ?? null;
}
