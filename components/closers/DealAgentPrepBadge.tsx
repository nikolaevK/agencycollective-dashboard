"use client";

import { AlertTriangle, Bot, Loader2, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeDot, badgeButtonClass, badgeToneHover, badgeVariants, type BadgeTone } from "@/components/ui/badge";
import type { DealPrepStatus } from "@/lib/dealPrepRules";

/** Deal queue row badge for the deal-prep agent (lib/dealPrep.ts). */
export interface DealAgentPrepBadgeData {
  status: DealPrepStatus;
  flagCount: number;
  blocker: boolean;
}

const STYLE: Partial<Record<DealPrepStatus, { label: string; tone: BadgeTone; icon: typeof Bot; title: string }>> = {
  queued: {
    label: "Agent queued",
    tone: "neutral",
    icon: Bot,
    title: "Queued for the deal-prep agent — prepared on its next run",
  },
  dispatched: {
    label: "Agent working",
    tone: "info",
    icon: Loader2,
    title: "The deal-prep agent is preparing the invoice and contract",
  },
  ready: {
    label: "Agent ready",
    tone: "success",
    icon: Sparkles,
    title: "The agent prepared the invoice + contract — review and send",
  },
  needs_input: {
    label: "Agent: needs input",
    tone: "warning",
    icon: AlertTriangle,
    title: "The agent prepared the paperwork but flagged something to decide before sending",
  },
  failed: {
    label: "Agent failed",
    tone: "danger",
    icon: XCircle,
    title: "The agent run failed or never reported back — open the deal to re-run it",
  },
  stale: {
    label: "Agent paused",
    tone: "warning",
    icon: RotateCcw,
    title: "A person edited this deal's paperwork, so the agent leaves it alone — open the deal to re-run it, or finish by hand",
  },
};

export function DealAgentPrepBadge({ prep, onClick }: { prep: DealAgentPrepBadgeData | null | undefined; onClick?: () => void }) {
  const style = prep ? STYLE[prep.status] : undefined;
  if (!prep || !style) return null;
  const Icon = style.icon;
  const flagSuffix = prep.flagCount > 0 && (prep.status === "ready" || prep.status === "needs_input") ? ` · ${prep.flagCount}` : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={prep.flagCount > 0 ? `${style.title} (${prep.flagCount} flag${prep.flagCount === 1 ? "" : "s"})` : style.title}
      className={cn(
        badgeVariants({ variant: "outline", tone: style.tone }),
        "gap-1.5 font-medium",
        prep.blocker && prep.status === "needs_input" && "border-amber-500/60",
        onClick ? cn("cursor-pointer", badgeToneHover[style.tone], badgeButtonClass) : "cursor-default"
      )}
    >
      <BadgeDot tone={style.tone} />
      <Icon className={cn("opacity-70", prep.status === "dispatched" && "animate-spin")} />
      {style.label}
      {flagSuffix}
    </button>
  );
}
