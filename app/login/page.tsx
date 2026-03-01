"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTheme } from "@/components/providers/ThemeProvider";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [userId, setUserId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, accountId }),
      });

      if (res.ok) {
        router.push("/portal/overview");
      } else {
        setError("Invalid credentials. Please check your User ID and Account Number.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* Background gradient orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse, hsl(263 70% 55%), hsl(210 100% 56%) 60%, transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/4 h-[400px] w-[600px] rounded-full opacity-10 blur-3xl"
        style={{
          background: "radial-gradient(ellipse, hsl(210 100% 56%), transparent)",
        }}
      />

      {/* Theme toggle — top right */}
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header with logo */}
          <div className="flex flex-col items-center gap-5 border-b border-border px-8 py-8">
            <div className="relative h-12 w-48">
              <Image
                src="/images/ac-logo.png"
                alt="Agency Collective"
                fill
                className={theme === "light" ? "object-contain invert" : "object-contain"}
                priority
              />
            </div>
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Client Portal
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in to view your campaign performance
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="px-8 py-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="userId"
                  className="text-sm font-medium text-foreground"
                >
                  User ID
                </label>
                <input
                  id="userId"
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Enter your User ID"
                  required
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="accountId"
                  className="text-sm font-medium text-foreground"
                >
                  Account Number
                </label>
                <input
                  id="accountId"
                  type="text"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="Enter your Meta Account Number"
                  required
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !userId || !accountId}
                className="relative mt-2 inline-flex h-10 w-full items-center justify-center overflow-hidden rounded-lg px-4 text-sm font-semibold text-white transition-opacity disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(263 70% 52%), hsl(210 100% 56%))",
                }}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                      />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-8 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              Powered by{" "}
              <span className="font-medium text-foreground">Agency Collective</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
