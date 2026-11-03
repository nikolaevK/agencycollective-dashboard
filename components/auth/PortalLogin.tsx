"use client";

import { useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ArrowRight, AtSign, Eye, EyeOff, Hand, Loader2, Lock, ShieldCheck, User } from "lucide-react";
import { checkUserAction, loginAction, setPasswordAction } from "@/app/actions/auth";
import {
  checkAdminAction,
  adminLoginAction,
  adminSetPasswordAction,
} from "@/app/actions/adminAuth";
import {
  checkCloserAction,
  closerLoginAction,
  closerSetPasswordAction,
} from "@/app/actions/closerAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type RoleKey = "client" | "admin" | "closer";
type Step = "credentials" | "createPassword" | "login";

type CheckAction = (identity: string) => Promise<{ exists: boolean; hasPassword: boolean }>;
type AuthAction = (identity: string, password: string) => Promise<{ error?: string } | undefined>;

type RoleConfig = {
  label: string;
  Icon: typeof User;
  identityLabel: string;
  identityPlaceholder: string;
  identityType: "text" | "email";
  identityAutoComplete: string;
  notFoundError: string;
  check: CheckAction;
  login: AuthAction;
  setPassword: AuthAction;
};

export interface PortalLoginProps {
  /** Which roles this page exposes. A single role hides the selector; multiple shows tabs. */
  roleKeys: RoleKey[];
  /** Branding panel copy. Rendered as `{title} <em>{emphasis}</em>` + subtitle. */
  hero: { title: string; emphasis: string; subtitle: string };
  /** Form panel headings. */
  welcome: { heading: string; subheading: string };
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

function IdentityBadge({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-3xl bg-muted py-1.5 pl-4 pr-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">Signing in as</span>
      <span className="min-w-0 truncate text-xs font-medium text-foreground">{label}</span>
      <Button type="button" variant="ghost" size="xs" onClick={onBack} className="ml-auto shrink-0 text-muted-foreground">
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
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          autoFocus={autoFocus}
          autoComplete={id === "password" ? "current-password" : "new-password"}
          className="h-10 pl-10 pr-11"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex items-center px-3.5 text-muted-foreground transition-colors hover:text-foreground"
          tabIndex={-1}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-role configuration — labels, identity field shape, and the three
// server actions. The auth mechanics are identical to the original page;
// only the dispatch is keyed by role.
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<RoleKey, RoleConfig> = {
  client: {
    label: "Client",
    Icon: User,
    identityLabel: "Account Email",
    identityPlaceholder: "name@company.com",
    identityType: "email",
    identityAutoComplete: "email",
    notFoundError: "No account found with this email. Please contact your account manager.",
    check: checkUserAction,
    login: loginAction,
    setPassword: setPasswordAction,
  },
  closer: {
    label: "Closer",
    Icon: Hand,
    identityLabel: "Account Email",
    identityPlaceholder: "name@company.com",
    identityType: "email",
    identityAutoComplete: "email",
    notFoundError: "No closer account found with this email. Please contact your administrator.",
    check: checkCloserAction,
    login: closerLoginAction,
    setPassword: closerSetPasswordAction,
  },
  admin: {
    label: "Admin",
    Icon: ShieldCheck,
    identityLabel: "Username",
    identityPlaceholder: "Enter your username",
    identityType: "text",
    identityAutoComplete: "username",
    notFoundError: "Username not found.",
    check: checkAdminAction,
    login: adminLoginAction,
    setPassword: adminSetPasswordAction,
  },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function getInitialRole(roleKeys: RoleKey[], param: string | null): RoleKey {
  if (param && roleKeys.includes(param as RoleKey)) return param as RoleKey;
  return roleKeys[0];
}

/** The AC wordmark is white artwork: inverted wherever it sits on a light surface. */
function Logo({ className }: { className?: string }) {
  return (
    <div className="relative h-8 w-32">
      <Image
        src="/images/ac-logo.png"
        alt="Agency Collective"
        fill
        sizes="128px"
        className={cn("object-contain", className)}
        priority
      />
    </div>
  );
}

export function PortalLogin(props: PortalLoginProps) {
  return (
    <Suspense fallback={<div className="min-h-svh bg-muted/40" />}>
      <PortalLoginContent {...props} />
    </Suspense>
  );
}

function PortalLoginContent({ roleKeys, hero, welcome }: PortalLoginProps) {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const showSelector = roleKeys.length > 1;

  const [role, setRole] = useState<RoleKey>(() => getInitialRole(roleKeys, searchParams.get("role")));
  const [step, setStep] = useState<Step>("credentials");
  const [identity, setIdentity] = useState(""); // email or username
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = ROLE_CONFIG[role];

  function switchRole(r: RoleKey) {
    if (r === role) return;
    setRole(r);
    setStep("credentials");
    setIdentity("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirm(false);
    setError(null);
  }

  function goBack() {
    setError(null);
    setPassword("");
    setConfirmPassword("");
    setStep("credentials");
  }

  // ── Step 1: check identity ──
  function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await config.check(identity);
      if (!result.exists) { setError(config.notFoundError); return; }
      setStep(result.hasPassword ? "login" : "createPassword");
    });
  }

  // ── Step 2a: create password ──
  function handleCreatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    startTransition(async () => {
      const result = await config.setPassword(identity, password);
      if (result?.error) setError(result.error);
    });
  }

  // ── Step 2b: login ──
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await config.login(identity, password);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4 sm:p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6 md:max-w-4xl">
        <Card>
          <div className="grid md:grid-cols-2">
            {/* ── Form side ── */}
            <div className="flex flex-col gap-6 p-6 sm:p-8 md:p-10">
              {/* Logo (the branding panel carries it on md+) */}
              <div className="flex justify-center md:hidden">
                <Logo className="invert dark:invert-0" />
              </div>

              <div className="flex flex-col gap-1.5 text-center md:text-left">
                <h1 className="text-2xl font-semibold tracking-tight">{welcome.heading}</h1>
                <p className="text-sm text-muted-foreground text-balance">{welcome.subheading}</p>
              </div>

              {/* ── Role selector (only when more than one role) ── */}
              {showSelector && (
                <div className="grid gap-2">
                  <p id="portal-access-label" className="text-sm font-medium leading-none">
                    Select Portal Access
                  </p>
                  <div
                    role="group"
                    aria-labelledby="portal-access-label"
                    className="grid gap-1 rounded-3xl bg-muted p-1"
                    style={{ gridTemplateColumns: `repeat(${roleKeys.length}, minmax(0, 1fr))` }}
                  >
                    {roleKeys.map((key) => {
                      const Icon = ROLE_CONFIG[key].Icon;
                      const active = role === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => switchRole(key)}
                          aria-pressed={active}
                          className={cn(
                            "flex h-9 items-center justify-center gap-2 rounded-3xl text-sm font-medium outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/30",
                            active
                              ? "bg-background text-foreground shadow-sm dark:bg-input/60"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Icon className="size-4" />
                          {ROLE_CONFIG[key].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Step 1: credentials ── */}
              {step === "credentials" && (
                <form onSubmit={handleCheck} className="grid gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="identity">{config.identityLabel}</Label>
                    <div className="relative">
                      <AtSign className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="identity"
                        key={role}
                        type={config.identityType}
                        value={identity}
                        onChange={(e) => setIdentity(e.target.value)}
                        placeholder={config.identityPlaceholder}
                        required
                        autoComplete={config.identityAutoComplete}
                        className="h-10 pl-10"
                      />
                    </div>
                  </div>
                  {error && <ErrorBox message={error} />}
                  <Button type="submit" size="lg" disabled={isPending || !identity.trim()} className="w-full">
                    {isPending ? (
                      <><Loader2 className="animate-spin" /> Checking...</>
                    ) : (
                      <>Continue <ArrowRight data-icon="inline-end" /></>
                    )}
                  </Button>
                </form>
              )}

              {/* ── Step 2a: create password ── */}
              {step === "createPassword" && (
                <form onSubmit={handleCreatePassword} className="grid gap-5">
                  <IdentityBadge label={identity} onBack={goBack} />
                  <div className="rounded-2xl border bg-muted/50 px-4 py-3">
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
                  <Button type="submit" size="lg" disabled={isPending || !password || !confirmPassword} className="w-full">
                    {isPending ? <><Loader2 className="animate-spin" /> Creating account...</> : "Create Password & Sign In"}
                  </Button>
                </form>
              )}

              {/* ── Step 2b: login ── */}
              {step === "login" && (
                <form onSubmit={handleLogin} className="grid gap-5">
                  <IdentityBadge label={identity} onBack={goBack} />
                  <PasswordField
                    id="password"
                    label="Portal Password"
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                    placeholder="Enter your password"
                    autoFocus
                  />
                  {error && <ErrorBox message={error} />}
                  <Button type="submit" size="lg" disabled={isPending || !password} className="w-full">
                    {isPending ? (
                      <><Loader2 className="animate-spin" /> Signing in...</>
                    ) : (
                      <>Access Portal <ArrowRight data-icon="inline-end" /></>
                    )}
                  </Button>
                </form>
              )}

              {/* Footer inside card */}
              <div className="border-t pt-5 text-center">
                <p className="text-sm text-muted-foreground">
                  Powered by{" "}
                  <span className="font-medium text-foreground">Agency Collective</span>
                </p>
              </div>
            </div>

            {/* ── Branding side (md+) ── */}
            <div className="hidden flex-col justify-between gap-10 border-l bg-muted p-10 md:flex">
              <Logo className="invert dark:invert-0" />
              <div className="space-y-4">
                <h2 className="text-4xl font-light leading-tight tracking-tight lg:text-5xl">
                  {hero.title}{" "}
                  <span className="font-semibold italic">{hero.emphasis}</span>
                </h2>
                <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                  {hero.subtitle}
                </p>
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                dashboard.agencycollective.ai
              </p>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <footer className="hidden justify-center md:flex">
          <span className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Agency Collective. All rights reserved.
          </span>
        </footer>
      </div>
    </div>
  );
}
