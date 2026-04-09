import { Navigate } from "react-router-dom";
import { identify } from "app/analytics";
import { authClient } from "./neon-auth-client";

const popFromLocalStorage = (key: string): string | null => {
  if (typeof window !== "undefined" && window.localStorage) {
    const value = localStorage.getItem(key);
    localStorage.removeItem(key);
    return value;
  }

  return null;
};

export const LoginRedirect = () => {
  const { data: session } = authClient.useSession();

  const queryParams = new URLSearchParams(window.location.search);

  // Identify user in analytics if logged in
  const user = session?.user;
  if (user) {
    identify(user.id, {
      email: user.email || undefined,
      name: user.name || undefined,
    });
  }

  const next =
    queryParams.get("next") || popFromLocalStorage("dtbn-login-next");

  if (next) {
    return <Navigate to={next} replace={true} />;
  }

  return <Navigate to="/" replace={true} />;
};
