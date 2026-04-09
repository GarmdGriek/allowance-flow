import type * as React from "react";
import { createContext, useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authClient } from "./neon-auth-client";

type BetterAuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  image?: string | null;
};

type UserGuardContextType = {
  user: BetterAuthUser;
};

const UserGuardContext = createContext<UserGuardContextType | undefined>(
  undefined,
);

/**
 * Hook to access the logged in user from within a <UserGuard> component.
 */
export const useUserGuardContext = () => {
  const context = useContext(UserGuardContext);

  if (context === undefined) {
    throw new Error("useUserGuardContext must be used within a <UserGuard>");
  }

  return context;
};

const writeToLocalStorage = (key: string, value: string) => {
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(key, value);
  }
};

export const UserGuard = (props: {
  children: React.ReactNode;
}) => {
  const { data: session, isPending } = authClient.useSession();
  const { pathname } = useLocation();

  const hasVerifier = new URLSearchParams(window.location.search).has("neon_auth_session_verifier");

  if (isPending) return null;

  // Verifier exchange complete — clean it from the URL and render
  if (hasVerifier && session?.user) {
    const url = new URL(window.location.href);
    url.searchParams.delete("neon_auth_session_verifier");
    window.history.replaceState({}, "", url.toString());
  }

  // Verifier still being exchanged — wait
  if (hasVerifier && !session?.user) {
    return null;
  }

  if (!session?.user) {
    const queryParams = new URLSearchParams(window.location.search);
    writeToLocalStorage("dtbn-login-next", pathname);
    queryParams.set("next", pathname);
    const queryString = queryParams.toString();
    return <Navigate to={`/auth/sign-in?${queryString}`} replace={true} />;
  }

  return (
    <UserGuardContext.Provider value={{ user: session.user as BetterAuthUser }}>
      {props.children}
    </UserGuardContext.Provider>
  );
};
