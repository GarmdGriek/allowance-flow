import * as React from "react";
import { useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { authClient } from "./neon-auth-client";
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
        setError(result.error.message || "Failed to send reset email.");
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
          {isSignUp ? "Create an account" : "Welcome back"}
        </CardTitle>
        <CardDescription className="text-center">
          {isSignUp
            ? "Sign up to get started with Allowance Flow"
            : "Sign in to your Allowance Flow account"}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </AuthLayout>
  );
};
