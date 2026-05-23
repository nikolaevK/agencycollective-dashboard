"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Link2, Save, Database, ShieldCheck, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateUserAction } from "@/app/actions/users";
import type { ClientPublic } from "./types";

export function ClientSettingsTab({
  client,
  onEdit,
  onManageAccounts,
  onChanged,
}: {
  client: ClientPublic;
  onEdit: () => void;
  onManageAccounts: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [payoutBrand, setPayoutBrand] = useState(client.payoutBrand ?? "");
  const [joinedAt, setJoinedAt] = useState(client.joinedAt ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function saveLink() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("id", client.id);
    fd.set("payoutBrand", payoutBrand.trim());
    fd.set("joinedAt", joinedAt.trim());
    startTransition(async () => {
      const res = await updateUserAction(fd);
      if (res.error) {
        setError(res.error);
      } else {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
        queryClient.invalidateQueries({ queryKey: ["client-billing", client.id] });
        onChanged();
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Profile + accounts */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5">
        <h3 className="text-sm font-bold text-foreground mb-1">Profile & access</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Name, email, category, status, logo and AI Analyst access.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onEdit}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit profile
          </button>
          <button
            onClick={onManageAccounts}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <Link2 className="h-4 w-4" />
            Manage Meta accounts
          </button>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              client.analystEnabled
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            )}
          >
            {client.analystEnabled ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <ShieldOff className="h-3.5 w-3.5" />
            )}
            AI Analyst {client.analystEnabled ? "enabled" : "disabled"}
          </span>
        </div>
      </div>

      {/* Payout link */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Payout-DB link</h3>
          {client.isLinked ? (
            <span className="ml-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Linked
            </span>
          ) : (
            <span className="ml-1 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              Not linked
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          The brand name this client maps to in the Payout DB. Drives MRR, payment
          history, documents and the re-bill schedule. Currently matched to{" "}
          <span className="font-medium text-foreground">
            {client.matchedBrand ?? "— none —"}
          </span>
          .
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Payout brand name
            </label>
            <input
              type="text"
              value={payoutBrand}
              onChange={(e) => setPayoutBrand(e.target.value)}
              placeholder="e.g. Inner Glow"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Date joined
            </label>
            <input
              type="date"
              value={joinedAt}
              onChange={(e) => setJoinedAt(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={saveLink}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isPending ? "Saving…" : "Save link"}
          </button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>}
        </div>
      </div>
    </div>
  );
}
