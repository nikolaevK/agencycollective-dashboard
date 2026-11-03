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
import { Button } from "@/components/ui/button";
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
    <div className="fixed inset-0 z-[60] flex flex-col bg-background md:hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h2 className="text-base font-medium">
          {isEdit ? "Edit Closer" : "Add New Closer"}
        </h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5">
        <form id="closer-mobile-form" onSubmit={handleSubmit} className="space-y-4">
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
                className="h-11 pl-9"
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
                className="h-11 pl-9"
              />
            </div>
          </div>

          {/* Role */}
          <div className="grid gap-2">
            <Label>
              Role Selection
            </Label>
            <Select value={role} onValueChange={(v) => setRole(v)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              {/* Above this hand-built z-[60] full-screen form */}
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
                className="h-11 pl-9"
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
                className="h-11 pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Monthly sales target in dollars
            </p>
          </div>

          {/* Helper Info */}
          {!isEdit && (
            <div className="rounded-2xl bg-muted/50 p-4">
              <div className="flex gap-3">
                <Lightbulb className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium mb-1">
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
      <div className="shrink-0 border-t bg-background px-4 py-3 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onClose}
          className="flex-1 h-11"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="closer-mobile-form"
          size="lg"
          disabled={isPending || !displayName.trim() || !email.trim()}
          className="flex-1 h-11"
        >
          {isPending
            ? "Saving..."
            : isEdit
              ? "Save Changes"
              : "Create Closer"}
        </Button>
      </div>
    </div>
  );
}
