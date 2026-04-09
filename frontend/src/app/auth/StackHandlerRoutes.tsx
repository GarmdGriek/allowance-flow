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

  // Handle redirect path — just navigate to next or stored destination
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-lg">
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
              <Label htmlFor="password">Password</Label>
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
      </Card>
    </div>
  );
};
