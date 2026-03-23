"use client";

import { useState, useEffect, useTransition } from "react";
import {
  ArrowLeft,
  User,
  Mail,
  Percent,
  DollarSign,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLOSER_ROLES,
  type CloserPublic,
} from "@/components/closers/types";
import {
  createCloserAction,
  updateCloserAction,
} from "@/app/actions/closers";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  closer?: CloserPublic;
  onClose: () => void;
  onSaved: () => void;
}

const INPUT_CLS =
  "flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

export function AddEditCloserMobile({ closer, onClose, onSaved }: Props) {
  const isEdit = !!closer;
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("closer");
  const [commissionRate, setCommissionRate] = useState("");
  const [quota, setQuota] = useState("");

  useEffect(() => {
    if (closer) {
      setDisplayName(closer.displayName);
      setEmail(closer.email);
      setRole(closer.role);
      setCommissionRate(String(closer.commissionRate / 100));
      setQuota(String(closer.quota / 100));
    } else {
      setDisplayName("");
      setEmail("");
      setRole("closer");
      setCommissionRate("");
      setQuota("");
    }
    setError(null);
  }, [closer]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const fd = new FormData();
    fd.set("displayName", displayName.trim());
    fd.set("email", email.trim());
    fd.set("role", role);
    fd.set("commissionRate", commissionRate || "0");
    fd.set("quota", quota || "0");

    if (isEdit && closer) {
      fd.set("id", closer.id);
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateCloserAction(fd)
        : await createCloserAction(fd);

      if (result.error) {
        setError(result.error);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["admin-closers"] });
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground">
          {isEdit ? "Edit Closer" : "Add New Closer"}
        </h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-28">
        <form id="closer-mobile-form" onSubmit={handleSubmit} className="space-y-5">
          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="John Doe"
                required
                className={cn(INPUT_CLS, "pl-9")}
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Professional Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@company.com"
                required
                className={cn(INPUT_CLS, "pl-9")}
              />
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Role Selection
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={INPUT_CLS}
            >
              {CLOSER_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Commission Rate */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Commission Rate %
            </label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                placeholder="12.5"
                className={cn(INPUT_CLS, "pl-9")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Percentage of deal value paid as commission
            </p>
          </div>

          {/* Monthly Quota */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Monthly Quota $
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="number"
                step="1"
                min="0"
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                placeholder="50000"
                className={cn(INPUT_CLS, "pl-9")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Monthly sales target in dollars
            </p>
          </div>

          {/* Helper Info */}
          {!isEdit && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex gap-3">
                <Lightbulb className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Quick Tip
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    New closers will receive an email invitation to set up their
                    password and access their personal dashboard. They can start
                    logging deals immediately after setup.
                  </p>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="border-t border-border bg-card px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 h-11 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          form="closer-mobile-form"
          disabled={isPending || !displayName.trim() || !email.trim()}
          className="flex-1 h-11 rounded-lg ac-gradient text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:pointer-events-none"
        >
          {isPending
            ? "Saving..."
            : isEdit
              ? "Save Changes"
              : "Create Closer"}
        </button>
      </div>
    </div>
  );
}
