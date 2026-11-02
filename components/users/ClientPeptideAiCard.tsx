"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/components/providers/AdminProvider";
import { StatusBadge, badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import type { PeptideAiPolicy, PeptideAiSetting } from "@/lib/peptideAi";
import {
  PEPTIDE_AI_DEFAULT_CAP_CENTS,
  PEPTIDE_AI_OFF_REASON_LABEL,
  PEPTIDE_AI_STATE_LABEL,
  formatCycleDate,
  formatUsd,
  ordinalDay,
  peptideAiState,
  type PeptideAiState,
  type PeptideAiUsage,
} from "@/lib/peptideAiPresentation";

interface PeptideAiDetail {
  configured: boolean;
  setting: PeptideAiSetting;
  policy: PeptideAiPolicy;
  usage: PeptideAiUsage | null;
}

export const PEPTIDE_AI_STATE_TONE: Record<PeptideAiState, BadgeTone> = {
  off: "neutral",
  unknown: "neutral",
  never_opened: "info",
  not_used: "info",
  blocked: "danger",
  active: "success",
  near_cap: "warning",
  capped: "danger",
};

/** Usage meter tint: near the limit = amber, at it = red, else the chart blue. */
export function peptideAiMeterClass(state: PeptideAiState | null): string {
  return state === "capped"
    ? "[&>div]:bg-red-500"
    : state === "near_cap"
      ? "[&>div]:bg-amber-500"
      : "[&>div]:bg-chart-1";
}

async function readJson(res: Response): Promise<PeptideAiDetail> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data as PeptideAiDetail;
}

/**
 * Client Settings → Peptide AI: the on/off switch and the monthly budget
 * override, with this cycle's usage. Saving applies in Peptide AI at once.
 * Read-only for partner-book admins (the budget is the agency's spend).
 */
export function ClientPeptideAiCard({ userId, clientStatus }: { userId: string; clientStatus: string }) {
  const queryClient = useQueryClient();
  const { isExternal } = useAdmin();
  // Status is in the key so archiving the client shows here at once; staleTime 0
  // refetches on every mount, so a billing pause made on the Billing tab shows too.
  const key = ["client-peptide-ai", userId, clientStatus];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetch(`/api/admin/clients/${userId}/peptide-ai`).then(readJson),
    staleTime: 0,
  });

  const [enabled, setEnabled] = useState(true);
  const [capDollars, setCapDollars] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed the inputs only when the saved setting changes — a refetch that
  // merely brings new usage must not wipe what the admin is typing.
  const savedEnabled = data?.setting.enabled;
  const savedCap = data?.setting.capCents;
  useEffect(() => {
    if (savedEnabled === undefined || savedCap === undefined) return;
    setEnabled(savedEnabled);
    setCapDollars(savedCap === null ? "" : (savedCap / 100).toFixed(2));
  }, [savedEnabled, savedCap]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = capDollars.replace(/^\$/, "").trim();
      const capCents = trimmed === "" ? null : Math.round(Number(trimmed) * 100);
      if (capCents !== null && (!Number.isFinite(capCents) || capCents < 100)) {
        throw new Error("Budget must be at least $1.00, or empty for the default.");
      }
      const res = await fetch(`/api/admin/clients/${userId}/peptide-ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, capCents }),
      });
      return readJson(res);
    },
    onMutate: () => {
      setError(null);
      setSaved(false);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      queryClient.invalidateQueries({ queryKey: ["admin-peptide-ai"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Save failed"),
  });

  const state = data ? peptideAiState(data.policy.enabled, data.usage) : null;
  const usage = data?.usage?.provisioned ? data.usage : null;
  const cap = data?.policy.capCents ?? PEPTIDE_AI_DEFAULT_CAP_CENTS;
  const share = usage ? Math.min(1, usage.spentCents / cap) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <FlaskConical className="size-4 text-muted-foreground" />
          <CardTitle>Peptide AI</CardTitle>
          {state && (
            <StatusBadge tone={PEPTIDE_AI_STATE_TONE[state]} className="ml-1">
              {state === "off" && data?.policy.offReason
                ? `Off · ${PEPTIDE_AI_OFF_REASON_LABEL[data.policy.offReason].toLowerCase()}`
                : PEPTIDE_AI_STATE_LABEL[state]}
            </StatusBadge>
          )}
        </div>
        <CardDescription className="text-xs">
          The Peptide AI tab in this client&apos;s portal. The monthly budget resets on their billing day,
          doesn&apos;t roll over, and is enforced by Peptide AI before every request. It switches off by
          itself while the client is inactive or their billing is paused.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {!data.configured && (
              <p className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.warning)}>
                Peptide AI isn&apos;t connected on this deployment (PEPTIDE_AI_URL / PEPTIDE_AI_SHARED_SECRET).
              </p>
            )}

            {/* The switch below can be on while the client is still off: say so
                plainly, or the two read as a contradiction. */}
            {data.policy.offReason && data.policy.offReason !== "disabled" && (
              <p className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.warning)}>
                <span className="font-medium">Currently off for this client — </span>
                {data.policy.offReason === "paused"
                  ? "their billing is paused (Billing tab). "
                  : "the client is inactive or archived. "}
                The switch below stays on, and Peptide AI comes back by itself once that changes.
              </p>
            )}

            <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
              <Label className="font-normal sm:pb-2">
                <Switch checked={enabled} disabled={isExternal} onCheckedChange={setEnabled} />
                Allow Peptide AI for this client
              </Label>
              <div className="space-y-2">
                <Label htmlFor={`peptide-ai-cap-${userId}`}>Monthly budget (USD)</Label>
                <Input
                  id={`peptide-ai-cap-${userId}`}
                  type="text"
                  inputMode="decimal"
                  value={capDollars}
                  disabled={isExternal}
                  onChange={(e) => setCapDollars(e.target.value)}
                  placeholder={`${(PEPTIDE_AI_DEFAULT_CAP_CENTS / 100).toFixed(2)} (default)`}
                />
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2 tabular-nums">
                <span className="font-medium text-foreground">
                  {usage ? formatUsd(usage.spentCents) : "$0.00"} of {formatUsd(cap)} used
                </span>
                <span className="text-muted-foreground">
                  {usage?.periodEnd
                    ? `resets ${formatCycleDate(usage.periodEnd)}`
                    : `resets on the ${ordinalDay(data.policy.anchorDay)}`}
                  {usage?.lastActiveAt ? ` · last used ${formatCycleDate(usage.lastActiveAt)}` : ""}
                </span>
              </div>
              <Progress value={share * 100} className={cn("h-1.5", peptideAiMeterClass(state))} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {isExternal ? (
              <p className="text-xs text-muted-foreground">Managed by the agency.</p>
            ) : (
            <div className="flex items-center gap-3">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save />
                {save.isPending ? "Saving…" : "Save Peptide AI"}
              </Button>
              {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>}
            </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
