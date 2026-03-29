"use client";

import { useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
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

type Role = "client" | "admin" | "closer";
type Step = "credentials" | "createPassword" | "login";

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2.5">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}

function IdentityBadge({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[#eaf1ff] px-3 py-2">
      <span className="text-xs text-[#4d5d73]">Signing in as</span>
      <span className="text-xs font-semibold text-[#203044] truncate">{label}</span>
      <button
        type="button"
        onClick={onBack}
        className="ml-auto flex items-center gap-1 text-xs text-[#4d5d73] hover:text-[#203044] transition-colors shrink-0"
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
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-[#203044]">
        {label}
      </label>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg className="h-5 w-5 text-[#68788f] group-focus-within:text-[#702ae1] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </div>
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          autoFocus={autoFocus}
          autoComplete={id === "password" ? "current-password" : "new-password"}
          className="block w-full pl-11 pr-12 py-3.5 bg-[#eaf1ff] border-2 border-transparent rounded-xl focus:ring-0 focus:border-[#702ae1] focus:bg-white text-[#203044] placeholder:text-[#9eaec7] transition-all outline-none text-sm"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#68788f] hover:text-[#203044] transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role icon SVGs (inline to avoid Material Symbols font dependency)
// ---------------------------------------------------------------------------

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function ClientIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

function CloserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 0-.668-.668 1.667 1.667 0 0 0-1.667 1.667v-6.18a1.575 1.575 0 0 0-3.15 0" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function getInitialRole(param: string | null): Role {
  if (param === "admin" || param === "closer") return param;
  return "client";
}

export default function UnifiedLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: "#f4f6ff" }} />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [role, setRole] = useState<Role>(() => getInitialRole(searchParams.get("portal")));
  const [step, setStep] = useState<Step>("credentials");
  const [identity, setIdentity] = useState(""); // email or username
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchRole(r: Role) {
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
      if (role === "admin") {
        const result = await checkAdminAction(identity);
        if (!result.exists) { setError("Username not found."); return; }
        setStep(result.hasPassword ? "login" : "createPassword");
      } else if (role === "client") {
        const result = await checkUserAction(identity);
        if (!result.exists) { setError("No account found with this email. Please contact your account manager."); return; }
        setStep(result.hasPassword ? "login" : "createPassword");
      } else {
        const result = await checkCloserAction(identity);
        if (!result.exists) { setError("No closer account found with this email. Please contact your administrator."); return; }
        setStep(result.hasPassword ? "login" : "createPassword");
      }
    });
  }

  // ── Step 2a: create password ──
  function handleCreatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    startTransition(async () => {
      if (role === "admin") {
        const result = await adminSetPasswordAction(identity, password);
        if (result?.error) setError(result.error);
      } else if (role === "client") {
        const result = await setPasswordAction(identity, password);
        if (result?.error) setError(result.error);
      } else {
        const result = await closerSetPasswordAction(identity, password);
        if (result?.error) setError(result.error);
      }
    });
  }

  // ── Step 2b: login ──
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (role === "admin") {
        const result = await adminLoginAction(identity, password);
        if (result?.error) setError(result.error);
      } else if (role === "client") {
        const result = await loginAction(identity, password);
        if (result?.error) setError(result.error);
      } else {
        const result = await closerLoginAction(identity, password);
        if (result?.error) setError(result.error);
      }
    });
  }

  const identityLabel = role === "admin" ? "Username" : "Account Email";
  const identityPlaceholder = role === "admin" ? "Enter your username" : "name@company.com";
  const identityType = role === "admin" ? "text" : "email";

  const roles: { value: Role; label: string; Icon: typeof AdminIcon }[] = [
    { value: "client", label: "Client", Icon: ClientIcon },
    { value: "closer", label: "Closer", Icon: CloserIcon },
    { value: "admin", label: "Admin", Icon: AdminIcon },
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-between selection:bg-[#b28cff]/30 selection:text-[#2e006c]"
      style={{
        backgroundColor: "#f4f6ff",
        backgroundImage:
          "radial-gradient(at 0% 0%, rgba(112,42,225,0.08) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(112,42,225,0.05) 0px, transparent 50%)",
      }}
    >
      {/* Main content */}
      <main className="w-full max-w-screen-xl px-4 sm:px-6 md:px-12 py-8 md:py-12 flex items-center justify-center flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 w-full gap-0 shadow-[0_4px_24px_rgba(32,48,68,0.06)] rounded-xl overflow-hidden bg-white">
          {/* ── Branding side (desktop only) ── */}
          <div
            className="hidden lg:flex flex-col justify-between p-16 text-white"
            style={{ background: "linear-gradient(135deg, #702ae1 0%, #b28cff 100%)" }}
          >
            <div className="flex items-center gap-3">
              <div className="relative h-8 w-32">
                <Image
                  src="/images/ac-logo.png"
                  alt="Agency Collective"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
            <div className="space-y-6">
              <h1 className="text-5xl font-light leading-tight">
                Your Ad Performance{" "}
                <span className="font-semibold italic">Command Center.</span>
              </h1>
              <p className="text-lg opacity-80 max-w-md font-normal leading-relaxed">
                A sophisticated platform designed for Admins, Clients, and
                Closers to orchestrate high-performance ad campaigns.
              </p>
            </div>
            <p className="text-sm font-medium opacity-90">
              dashboard.agencycollective.ai
            </p>
          </div>

          {/* ── Form side ── */}
          <div className="p-6 sm:p-8 md:p-12 lg:p-16 xl:p-20 flex flex-col justify-center bg-white">
            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-3 mb-10">
              <div className="relative h-8 w-32">
                <Image
                  src="/images/ac-logo.png"
                  alt="Agency Collective"
                  fill
                  className="object-contain invert"
                  priority
                />
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#203044] mb-2 tracking-tight">
                Welcome back
              </h2>
              <p className="text-[#595c5d] font-normal text-sm sm:text-base">
                Select your portal to continue.
              </p>
            </div>

            {/* ── Role selector ── */}
            <div className="space-y-3 mb-6">
              <label className="block text-sm font-semibold text-[#203044]">
                Select Portal Access
              </label>

              {/* Desktop: horizontal pills */}
              <div className="hidden sm:grid grid-cols-3 gap-2 p-1.5 bg-[#eaf1ff] rounded-xl">
                {roles.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => switchRole(r.value)}
                    className={`w-full py-2.5 px-3 rounded-lg text-sm font-medium text-center transition-all ${
                      role === r.value
                        ? "bg-white text-[#702ae1] shadow-sm"
                        : "text-[#595c5d] hover:bg-white/50"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Mobile: icon + label buttons */}
              <div className="grid grid-cols-3 gap-2 sm:hidden bg-[#eaf1ff] p-1.5 rounded-2xl">
                {roles.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => switchRole(r.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all duration-200 ${
                      role === r.value
                        ? "bg-[#702ae1] text-white shadow-md shadow-[#702ae1]/20"
                        : "text-[#4d5d73] hover:bg-white/30"
                    }`}
                  >
                    <r.Icon className="h-5 w-5" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">
                      {r.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Step 1: credentials ── */}
            {step === "credentials" && (
              <form onSubmit={handleCheck} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="identity" className="block text-sm font-semibold text-[#203044]">
                    {identityLabel}
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-[#68788f] group-focus-within:text-[#702ae1] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm0 0c0 1.657 1.007 3 2.25 3S21 13.657 21 12a9 9 0 1 0-2.636 6.364M16.5 12V8.25" />
                      </svg>
                    </div>
                    <input
                      id="identity"
                      key={role}
                      type={identityType}
                      value={identity}
                      onChange={(e) => setIdentity(e.target.value)}
                      placeholder={identityPlaceholder}
                      required
                      autoFocus
                      autoComplete={role === "admin" ? "username" : "email"}
                      className="block w-full pl-11 pr-4 py-3.5 bg-[#eaf1ff] border-2 border-transparent rounded-xl focus:ring-0 focus:border-[#702ae1] focus:bg-white text-[#203044] placeholder:text-[#9eaec7] transition-all outline-none text-sm"
                    />
                  </div>
                </div>
                {error && <ErrorBox message={error} />}
                <button
                  type="submit"
                  disabled={isPending || !identity.trim()}
                  className="w-full py-4 px-6 bg-[#702ae1] hover:bg-[#6411d5] text-white font-bold rounded-xl shadow-lg shadow-[#702ae1]/20 hover:shadow-[#702ae1]/30 active:scale-[0.98] transition-all transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none text-sm"
                >
                  {isPending ? <><Spinner /> Checking...</> : (
                    <>
                      Continue
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ── Step 2a: create password ── */}
            {step === "createPassword" && (
              <form onSubmit={handleCreatePassword} className="space-y-5">
                <IdentityBadge label={identity} onBack={goBack} />
                <div className="rounded-xl border border-[#702ae1]/20 bg-[#702ae1]/5 px-3 py-2.5">
                  <p className="text-xs text-[#702ae1]/80">
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
                  className="w-full py-4 px-6 bg-[#702ae1] hover:bg-[#6411d5] text-white font-bold rounded-xl shadow-lg shadow-[#702ae1]/20 hover:shadow-[#702ae1]/30 active:scale-[0.98] transition-all transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none text-sm"
                >
                  {isPending ? <><Spinner /> Creating account...</> : "Create Password & Sign In"}
                </button>
              </form>
            )}

            {/* ── Step 2b: login ── */}
            {step === "login" && (
              <form onSubmit={handleLogin} className="space-y-5">
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
                <button
                  type="submit"
                  disabled={isPending || !password}
                  className="w-full py-4 px-6 bg-[#702ae1] hover:bg-[#6411d5] text-white font-bold rounded-xl shadow-lg shadow-[#702ae1]/20 hover:shadow-[#702ae1]/30 active:scale-[0.98] transition-all transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none text-sm"
                >
                  {isPending ? <><Spinner /> Signing in...</> : (
                    <>
                      Access Portal
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Footer inside card */}
            <div className="mt-8 pt-6 border-t border-[#eaf1ff] text-center">
              <p className="text-sm text-[#595c5d]">
                Powered by{" "}
                <span className="font-semibold text-[#203044]">Agency Collective</span>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full hidden md:flex justify-center items-center gap-6 p-6 bg-transparent">
        <span className="text-sm text-[#68788f]">
          &copy; {new Date().getFullYear()} Agency Collective. All rights reserved.
        </span>
      </footer>
    </div>
  );
}
