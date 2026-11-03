"use client";

import { useState, useEffect, useTransition } from "react";
import { X, User, Mail, Percent, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="fixed inset-0 z-[60] hidden md:flex items-center justify-center">
      {/* Backdrop */}
      <div
        className={dialogOverlayClass}
        onClick={onClose}
      />

      {/* Modal */}
      <div className={cn(dialogPanelClass, "relative z-50 w-full max-w-lg mx-4 max-h-[90dvh] overflow-y-auto overscroll-contain")}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-popover px-6 pt-6 pb-4">
          <h2 className="text-base font-medium leading-none">
            {isEdit ? "Edit Closer" : "Add New Closer"}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
            className="bg-secondary"
          >
            <X />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Full Name */}
          <div className="grid gap-2">
            <Label>
              Full Name
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="John Doe"
                required
                className="pl-9"
              />
            </div>
          </div>

          {/* Email */}
          <div className="grid gap-2">
            <Label>
              Professional Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@company.com"
                required
                className="pl-9"
              />
            </div>
          </div>

          {/* Role */}
          <div className="grid gap-2">
            <Label>
              Role Selection
            </Label>
            <Select value={role} onValueChange={(v) => setRole(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              {/* Above this hand-built z-[60] modal */}
              <SelectContent className="z-[70]">
                {CLOSER_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Commission Rate */}
          <div className="grid gap-2">
            <Label>
              Commission Rate %
            </Label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                max="100"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                placeholder="12.5"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Percentage of deal value paid as commission
            </p>
          </div>

          {/* Monthly Quota */}
          <div className="grid gap-2">
            <Label>
              Monthly Quota $
            </Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                placeholder="50000"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Monthly sales target in dollars
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !displayName.trim() || !email.trim()}
            >
              {isPending
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Create Closer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
