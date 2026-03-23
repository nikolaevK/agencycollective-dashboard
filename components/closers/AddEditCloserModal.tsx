"use client";

import { useState, useEffect, useTransition } from "react";
import { X, User, Mail, Percent, DollarSign } from "lucide-react";
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
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

export function AddEditCloserModal({ closer, onClose, onSaved }: Props) {
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
    <div className="fixed inset-0 z-50 hidden md:flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? "Edit Closer" : "Add New Closer"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
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

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !displayName.trim() || !email.trim()}
              className="h-9 rounded-lg ac-gradient px-5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:pointer-events-none"
            >
              {isPending
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Create Closer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
