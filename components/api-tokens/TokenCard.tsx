"use client";

import { useState } from "react";
import {
  BarChart3,
  ChevronDown,
  Pencil,
  RefreshCw,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/components/users/format";
import { SCOPE_MODULES } from "@/lib/apiScopes";
import type { ApiTokenPublic } from "./types";
import { TokenUsageStats } from "./TokenUsageStats";

interface TokenCardProps {
  token: ApiTokenPublic;
  canMutate: boolean;
  onEdit: (token: ApiTokenPublic) => void;
  onRotate: (token: ApiTokenPublic) => void;
  onRevoke: (token: ApiTokenPublic) => void;
  onDelete: (token: ApiTokenPublic) => void;
}

function tokenStatus(token: ApiTokenPublic): "active" | "revoked" | "expired" {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt) {
    const expiry =
      token.expiresAt.length <= 10 ? `${token.expiresAt}T23:59:59.999Z` : token.expiresAt;
    if (expiry < new Date().toISOString()) return "expired";
  }
  return "active";
}

const LEVEL_BADGE: Record<string, string> = {
  read: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  write: "bg-primary/10 text-primary",
  delete: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function TokenCard({
  token,
  canMutate,
  onEdit,
  onRotate,
  onRevoke,
  onDelete,
}: TokenCardProps) {
  const [showUsage, setShowUsage] = useState(false);
  const status = tokenStatus(token);
  const restrictions: string[] = [];
  if (token.workspaces && token.workspaces.length > 0) {
    restrictions.push(
      `${token.workspaces.length} workspace${token.workspaces.length > 1 ? "s" : ""}`
    );
  }
  if (token.clientIds && token.clientIds.length > 0) {
    restrictions.push(`${token.clientIds.length} client${token.clientIds.length > 1 ? "s" : ""}`);
  }
  if (token.closerIds && token.closerIds.length > 0) {
    restrictions.push(`${token.closerIds.length} closer${token.closerIds.length > 1 ? "s" : ""}`);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate">{token.name}</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                status === "active" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                status === "revoked" && "bg-red-500/10 text-red-600 dark:text-red-400",
                status === "expired" && "bg-muted text-muted-foreground"
              )}
            >
              {status === "active" ? "Active" : status === "revoked" ? "Revoked" : "Expired"}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {token.prefix}_••••••••
          </p>
        </div>
        {canMutate && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(token)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
              title="Edit scopes & access"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onRotate(token)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
              title="Rotate secret"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {status !== "revoked" && (
              <button
                onClick={() => onRevoke(token)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-amber-500 transition-colors"
                title="Revoke token"
              >
                <ShieldOff className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => onDelete(token)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-red-500 transition-colors"
              title="Delete token permanently"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Scope chips */}
      <div className="flex flex-wrap gap-1.5">
        {SCOPE_MODULES.map((mod) => {
          const level = token.scopes[mod.key];
          if (!level || level === "none") return null;
          return (
            <span
              key={mod.key}
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-medium",
                LEVEL_BADGE[level] ?? "bg-muted text-muted-foreground"
              )}
            >
              {mod.label}: {level}
            </span>
          );
        })}
        {restrictions.length > 0 && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Limited to {restrictions.join(" + ")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {token.requestCount.toLocaleString()} request{token.requestCount === 1 ? "" : "s"}
        </span>
        <span>Last used: {token.lastUsedAt ? formatDate(token.lastUsedAt) : "never"}</span>
        <span>
          {token.expiresAt ? `Expires ${formatDate(token.expiresAt)}` : "No expiry"}
        </span>
        {token.createdByName && <span>Created by {token.createdByName}</span>}
        <button
          onClick={() => setShowUsage((v) => !v)}
          className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Usage
          <ChevronDown className={cn("h-3 w-3 transition-transform", showUsage && "rotate-180")} />
        </button>
      </div>

      {showUsage && <TokenUsageStats tokenId={token.id} />}
    </div>
  );
}
