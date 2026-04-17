import * as React from "react";
import { useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { authClient } from "./neon-auth-client";
import { apiClient } from "app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const AuthLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800 p-4">
    <Card className="w-full max-w-md shadow-lg">{children}</Card>
  </div>
);

const ForgotPasswordScreen = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const result = await authClient.forgetPassword({
        email,
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (result.error) {
        setError(result.error.message || JSON.stringify(result.error) || "Failed to send reset email.");
      } else {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl font-bold text-center">Reset password</CardTitle>
        <CardDescription className="text-center">
          Enter your email and we&apos;ll send you a reset link
        </CardDescription>
      </CardHeader>
      <CardContent>
        {success ? (
          <div className="text-center space-y-4">
            <p className="text-green-600 dark:text-green-400 font-medium">
              ✓ Check your email for a reset link
            </p>
            <a href="/auth/sign-in" className="text-sm text-orange-600 hover:underline">
              Back to sign in
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Send reset link"}
            </Button>
            <div className="text-center text-sm">
              <a href="/auth/sign-in" className="text-orange-600 hover:underline">
                Back to sign in
              </a>
            </div>
          </form>
        )}
      </CardContent>
    </AuthLayout>
  );
};

const ResetPasswordScreen = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const token = queryParams.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.message || "Failed to reset password.");
      } else {
        navigate("/auth/sign-in", { replace: true });
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return <Navigate to="/auth/forgot-password" replace />;
  }

  return (
    <AuthLayout>
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl font-bold text-center">Set new password</CardTitle>
        <CardDescription className="text-center">
          Choose a strong password for your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold"
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : "Set new password"}
          </Button>
        </form>
      </CardContent>
    </AuthLayout>
  );
};

export const StackHandlerRoutes = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(window.location.search);
  const next = queryParams.get("next") || "/";

  const isSignUp = location.pathname.includes("sign-up");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Child login (username + family ID + PIN — no real email needed)
  const [isChildLogin, setIsChildLogin] = useState(false);
  const [childUsername, setChildUsername] = useState("");
  const [childFamilyId, setChildFamilyId] = useState("");
  const [childPin, setChildPin] = useState("");

  const handleChildSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      // Step 1: verify PIN server-side, get back the internal auth credentials
      // (http-client leaves `.data` null unless `format: "json"` is set, so we
      // unwrap via `.json()` — same pattern as elsewhere in the app.)
      let virtual_email: string;
      let auth_token: string;
      try {
        const credsResult = await apiClient.child_sign_in({
          username: childUsername.trim(),
          family_id: childFamilyId.trim(),
          pin: childPin,
        });
        const creds = await credsResult.json();
        virtual_email = creds.virtual_email;
        auth_token = creds.auth_token;
      } catch (httpErr: any) {
        const detail = httpErr?.error?.detail || httpErr?.detail;
        setError(detail || "Sign in failed. Check your username, family ID, and PIN.");
        return;
      }

      // Step 2: sign in to Neon Auth with the returned credentials so the
      // session cookie is set on the correct auth origin
      const result = await authClient.signIn.email({ email: virtual_email, password: auth_token });
      if (result.error) {
        setError(result.error.message || "Sign in failed.");
      } else {
        // Full reload (not SPA navigate) so UserGuard's useSession() re-fetches
        // /get-session from Neon Auth with the freshly-set cookie. Without this,
        // the in-memory session state lags and UserGuard bounces us back here.
        window.location.replace(next || "/");
      }
    } catch (err: any) {
      setError(err.message || "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Delegate to sub-screens
  if (location.pathname.includes("forgot-password")) return <ForgotPasswordScreen />;
  if (location.pathname.includes("reset-password")) return <ResetPasswordScreen />;

  // Handle redirect path
  if (location.pathname.includes("redirect")) {
    const storedNext = localStorage.getItem("dtbn-login-next");
    if (storedNext) {
      localStorage.removeItem("dtbn-login-next");
      return <Navigate to={storedNext} replace />;
    }
    return <Navigate to="/" replace />;
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message || "Sign in failed. Check your email and password.");
      } else {
        navigate(next, { replace: true });
      }
    } catch (err: any) {
      setError(err.message || "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const result = await authClient.signUp.email({ email, password, name });
      if (result.error) {
        setError(result.error.message || "Sign up failed. Please try again.");
      } else {
        navigate(next, { replace: true });
      }
    } catch (err: any) {
      setError(err.message || "Sign up failed");
    } finally {
      setIsLoading(false);
    }
  };

  const switchHref = isSignUp
    ? `/auth/sign-in${window.location.search}`
    : `/auth/sign-up${window.location.search}`;

  return (
    <AuthLayout>
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl font-bold text-center">
          {isSignUp ? "Create an account" : isChildLogin ? "Child sign in" : "Welcome back"}
        </CardTitle>
        <CardDescription className="text-center">
          {isSignUp
            ? "Sign up to get started with Allowance Flow"
            : isChildLogin
              ? "Enter your username, family ID, and PIN"
              : "Sign in to your Allowance Flow account"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isSignUp && isChildLogin ? (
          <form onSubmit={handleChildSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="child-username">Username</Label>
              <Input
                id="child-username"
                type="text"
                placeholder="e.g. alex"
                value={childUsername}
                onChange={(e) => setChildUsername(e.target.value)}
                required
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="child-family-id">Family ID</Label>
              <Input
                id="child-family-id"
                type="text"
                placeholder="Ask a parent for this"
                value={childFamilyId}
                onChange={(e) => setChildFamilyId(e.target.value)}
                required
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="child-pin">PIN</Label>
              <Input
                id="child-pin"
                type="password"
                inputMode="numeric"
                placeholder="••••"
                value={childPin}
                onChange={(e) => setChildPin(e.target.value)}
                required
                maxLength={8}
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>
            <div className="text-center text-sm">
              <button
                type="button"
                className="text-orange-600 hover:underline"
                onClick={() => { setIsChildLogin(false); setError(""); }}
              >
                Sign in as parent instead
              </button>
            </div>
          </form>
        ) : (
          <>
            <form
              onSubmit={isSignUp ? handleSignUp : handleSignIn}
              className="space-y-4"
            >
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {!isSignUp && (
                    <a
                      href="/auth/forgot-password"
                      className="text-xs text-orange-600 hover:underline"
                    >
                      Forgot password?
                    </a>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold"
                disabled={isLoading}
              >
                {isLoading
                  ? "Please wait..."
                  : isSignUp
                    ? "Create account"
                    : "Sign in"}
              </Button>
            </form>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-gray-900 px-2 text-muted-foreground">or</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center gap-2"
              onClick={async () => {
                const result = await authClient.signIn.social({
                  provider: "google",
                  callbackURL: window.location.origin + "/",
                });
                if (result?.error) {
                  setError(result.error.message || JSON.stringify(result.error));
                } else if ((result?.data as any)?.url) {
                  window.location.href = (result.data as any).url;
                }
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              Continue with Google
            </Button>
            {!isSignUp && (
              <>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-gray-900 px-2 text-muted-foreground">or</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => { setIsChildLogin(true); setError(""); }}
                >
                  Sign in as child (username + PIN)
                </Button>
              </>
            )}
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {isSignUp ? (
                <p>
                  Already have an account?{" "}
                  <a href={switchHref} className="text-orange-600 hover:underline font-medium">
                    Sign in
                  </a>
                </p>
              ) : (
                <p>
                  Don&apos;t have an account?{" "}
                  <a href={switchHref} className="text-orange-600 hover:underline font-medium">
                    Sign up
                  </a>
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </AuthLayout>
  );
};
