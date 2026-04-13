import { getNeonJwt } from "./neon-auth-client";

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
  return getNeonJwt();
}
