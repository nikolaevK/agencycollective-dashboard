"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
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
import { Badge, StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiTokenPublic } from "./types";

// Lazy: recharts only loads when a usage panel is opened.
const TokenUsageStats = dynamic(() => import("./TokenUsageStats").then((m) => m.TokenUsageStats), {
  ssr: false,
  loading: () => <Skeleton className="h-24 w-full" />,
});

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

const STATUS_META: Record<ReturnType<typeof tokenStatus>, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  revoked: { label: "Revoked", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};

// Stronger level, stronger color: read plain, write blue, delete amber.
const LEVEL_TONE: Record<string, BadgeTone> = {
  read: "neutral",
  write: "info",
  delete: "warning",
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
    <Card className="flex flex-col gap-3 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold break-all">{token.name}</h3>
            <StatusBadge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</StatusBadge>
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {token.prefix}_••••••••
          </p>
        </div>
        {canMutate && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEdit(token)}
              title="Edit scopes & access"
              aria-label={`Edit scopes & access for ${token.name}`}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRotate(token)}
              title="Rotate secret"
              aria-label={`Rotate secret for ${token.name}`}
            >
              <RefreshCw />
            </Button>
            {status !== "revoked" && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onRevoke(token)}
                title="Revoke token"
                aria-label={`Revoke ${token.name}`}
              >
                <ShieldOff />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDelete(token)}
              title="Delete token permanently"
              aria-label={`Delete ${token.name} permanently`}
              className="hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      {/* Scope chips */}
      <div className="flex flex-wrap gap-1.5">
        {SCOPE_MODULES.map((mod) => {
          const level = token.scopes[mod.key];
          if (!level || level === "none") return null;
          return (
            <Badge key={mod.key} variant="outline" tone={LEVEL_TONE[level] ?? "neutral"}>
              {mod.label}: {level}
            </Badge>
          );
        })}
        {restrictions.length > 0 && (
          <Badge variant="secondary" className="h-auto whitespace-normal text-muted-foreground">
            Limited to {restrictions.join(" + ")}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {token.requestCount.toLocaleString()} request{token.requestCount === 1 ? "" : "s"}
        </span>
        <span>Last used: {token.lastUsedAt ? formatDate(token.lastUsedAt) : "never"}</span>
        <span>
          {token.expiresAt ? `Expires ${formatDate(token.expiresAt)}` : "No expiry"}
        </span>
        {token.createdByName && <span>Created by {token.createdByName}</span>}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setShowUsage((v) => !v)}
          aria-expanded={showUsage}
          className="ml-auto text-muted-foreground"
        >
          <BarChart3 />
          Usage
          <ChevronDown className={cn("transition-transform", showUsage && "rotate-180")} />
        </Button>
      </div>

      {showUsage && <TokenUsageStats tokenId={token.id} />}
    </Card>
  );
}
