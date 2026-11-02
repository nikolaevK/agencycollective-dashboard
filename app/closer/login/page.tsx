"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkCloserAction, closerLoginAction, closerSetPasswordAction } from "@/app/actions/closerAuth";

type Step = "email" | "createPassword" | "login";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  );
}

export default function CloserLoginPage() {
  const { theme } = useTheme();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCheckUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await checkCloserAction(email);
      if (!result.exists) {
        setError("No closer account found with this email. Please contact your administrator.");
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
      const result = await closerSetPasswordAction(email, password);
      if (result?.error) setError(result.error);
    });
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await closerLoginAction(email, password);
      if (result?.error) setError(result.error);
    });
  }

  function goBack() {
    setError(null);
    setPassword("");
    setConfirmPassword("");
    setStep("email");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-muted/40 py-16">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <Card className="shadow-xl">
          {/* Header */}
          <div className="flex flex-col items-center gap-5 border-b px-6 py-8 sm:px-8">
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
              <h1 className="text-xl font-semibold tracking-tight">Closer Portal</h1>
              <p className="text-sm text-muted-foreground">
                {step === "email" && "Sign in to manage your sales performance"}
                {step === "createPassword" && "Create your password to get started"}
                {step === "login" && "Welcome back — enter your password"}
              </p>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8">
            {/* Step 1 — Email */}
            {step === "email" && (
              <form onSubmit={handleCheckUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                    autoFocus
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    The email address associated with your closer account.
                  </p>
                </div>
                {error && <ErrorBox message={error} />}
                <Button
                  type="submit"
                  size="lg"
                  disabled={isPending || !email.trim()}
                  className="mt-2 w-full"
                >
                  {isPending ? <><Spinner /> Checking...</> : "Continue"}
                </Button>
              </form>
            )}

            {/* Step 2a — Create password */}
            {step === "createPassword" && (
              <form onSubmit={handleCreatePassword} className="space-y-4">
                <UserBadge email={email} onBack={goBack} />
                <div className="rounded-2xl bg-muted/60 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">
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
                <Button
                  type="submit"
                  size="lg"
                  disabled={isPending || !password || !confirmPassword}
                  className="mt-2 w-full"
                >
                  {isPending ? <><Spinner /> Creating account...</> : "Create Password & Sign In"}
                </Button>
              </form>
            )}

            {/* Step 2b — Login */}
            {step === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <UserBadge email={email} onBack={goBack} />
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
                <Button
                  type="submit"
                  size="lg"
                  disabled={isPending || !password}
                  className="mt-2 w-full"
                >
                  {isPending ? <><Spinner /> Signing in...</> : "Sign In"}
                </Button>
              </form>
            )}
          </div>

          <div className="border-t px-6 py-4 text-center sm:px-8">
            <p className="text-xs text-muted-foreground">
              Powered by <span className="font-medium text-foreground">Agency Collective</span>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---- Small sub-components ----

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-destructive/10 px-3 py-2.5">
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}

function UserBadge({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-3xl bg-muted/60 py-1 pl-3 pr-1">
      <span className="shrink-0 text-xs text-muted-foreground">Signing in as</span>
      <span className="min-w-0 text-xs font-medium text-foreground truncate">{email}</span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={onBack}
        className="ml-auto text-muted-foreground"
      >
        <ArrowLeft />
        Change
      </Button>
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
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          autoFocus={autoFocus}
          className="h-10 pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}
