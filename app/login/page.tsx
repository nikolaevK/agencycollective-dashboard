"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { checkUserAction, loginAction, setPasswordAction } from "@/app/actions/auth";

type Step = "userId" | "createPassword" | "login";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  );
}

const INPUT_CLS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:opacity-50 transition-shadow";

const BTN_STYLE = {
  background: "linear-gradient(135deg, hsl(263 70% 52%), hsl(210 100% 56%))",
};

export default function LoginPage() {
  const { theme } = useTheme();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("userId");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCheckUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await checkUserAction(userId);
      if (!result.exists) {
        setError("User ID not found. Please contact your administrator.");
        return;
      }
      setStep(result.hasPassword ? "login" : "createPassword");
    });
  }

  function handleCreatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    startTransition(async () => {
      const result = await setPasswordAction(userId, password);
      if (result?.error) setError(result.error);
      // On success, server action redirects — no client code needed
    });
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await loginAction(userId, password);
      if (result?.error) setError(result.error);
      // On success, server action redirects — no client code needed
    });
  }

  function goBack() {
    setError(null);
    setPassword("");
    setConfirmPassword("");
    setStep("userId");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{
          background: "radial-gradient(ellipse, hsl(263 70% 55%), hsl(210 100% 56%) 60%, transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/4 h-[400px] w-[600px] rounded-full opacity-10 blur-3xl"
        style={{ background: "radial-gradient(ellipse, hsl(210 100% 56%), transparent)" }}
      />

      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
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
              <h1 className="text-xl font-bold tracking-tight text-foreground">Client Portal</h1>
              <p className="text-sm text-muted-foreground">
                {step === "userId" && "Sign in to view your campaign performance"}
                {step === "createPassword" && "Create your password to get started"}
                {step === "login" && "Welcome back — enter your password"}
              </p>
            </div>
          </div>

          <div className="px-8 py-6">
            {/* Step 1 — User ID */}
            {step === "userId" && (
              <form onSubmit={handleCheckUser} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="userId" className="text-sm font-medium text-foreground">
                    User ID
                  </label>
                  <input
                    id="userId"
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="Enter your User ID"
                    required
                    autoFocus
                    className={INPUT_CLS}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your User ID was provided by your account manager.
                  </p>
                </div>
                {error && <ErrorBox message={error} />}
                <button
                  type="submit"
                  disabled={isPending || !userId.trim()}
                  className="relative mt-2 inline-flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-lg px-4 text-sm font-semibold text-white transition-opacity disabled:pointer-events-none disabled:opacity-50"
                  style={BTN_STYLE}
                >
                  {isPending ? <><Spinner /> Checking...</> : "Continue"}
                </button>
              </form>
            )}

            {/* Step 2a — Create password */}
            {step === "createPassword" && (
              <form onSubmit={handleCreatePassword} className="space-y-4">
                <UserBadge userId={userId} onBack={goBack} />
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                  <p className="text-xs text-primary/80">
                    First time signing in — please create a password for your account.
                  </p>
                </div>
                <PasswordField
                  id="password"
                  label="New Password"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  placeholder="Min. 8 characters"
                  autoFocus
                />
                <PasswordField
                  id="confirmPassword"
                  label="Confirm Password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  show={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                  placeholder="Repeat your password"
                />
                {error && <ErrorBox message={error} />}
                <button
                  type="submit"
                  disabled={isPending || !password || !confirmPassword}
                  className="relative mt-2 inline-flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-lg px-4 text-sm font-semibold text-white transition-opacity disabled:pointer-events-none disabled:opacity-50"
                  style={BTN_STYLE}
                >
                  {isPending ? <><Spinner /> Creating account...</> : "Create Password & Sign In"}
                </button>
              </form>
            )}

            {/* Step 2b — Login */}
            {step === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <UserBadge userId={userId} onBack={goBack} />
                <PasswordField
                  id="password"
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  placeholder="Enter your password"
                  autoFocus
                />
                {error && <ErrorBox message={error} />}
                <button
                  type="submit"
                  disabled={isPending || !password}
                  className="relative mt-2 inline-flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-lg px-4 text-sm font-semibold text-white transition-opacity disabled:pointer-events-none disabled:opacity-50"
                  style={BTN_STYLE}
                >
                  {isPending ? <><Spinner /> Signing in...</> : "Sign In"}
                </button>
              </form>
            )}
          </div>

          <div className="border-t border-border px-8 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              Powered by <span className="font-medium text-foreground">Agency Collective</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Small sub-components ----

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}

function UserBadge({ userId, onBack }: { userId: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">Signing in as</span>
      <span className="text-xs font-semibold text-foreground">{userId}</span>
      <button
        type="button"
        onClick={onBack}
        className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Change
      </button>
    </div>
  );
}

function PasswordField({
  id, label, value, onChange, show, onToggle, placeholder, autoFocus,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void; placeholder: string; autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          autoFocus={autoFocus}
          className={INPUT_CLS + " pr-10"}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
