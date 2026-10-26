"use client";

import { AlertTriangle, Bot, Loader2, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DealPrepStatus } from "@/lib/dealPrepRules";

/** Deal queue row badge for the deal-prep agent (lib/dealPrep.ts). */
export interface DealAgentPrepBadgeData {
  status: DealPrepStatus;
  flagCount: number;
  blocker: boolean;
}

const STYLE: Partial<Record<DealPrepStatus, { label: string; cls: string; icon: typeof Bot; title: string }>> = {
  queued: {
    label: "Agent queued",
    cls: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
    icon: Bot,
    title: "Queued for the deal-prep agent — prepared on its next run",
  },
  dispatched: {
    label: "Agent working",
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    icon: Loader2,
    title: "The deal-prep agent is preparing the invoice and contract",
  },
  ready: {
    label: "Agent ready",
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    icon: Sparkles,
    title: "The agent prepared the invoice + contract — review and send",
  },
  needs_input: {
    label: "Agent: needs input",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    icon: AlertTriangle,
    title: "The agent prepared the paperwork but flagged something to decide before sending",
  },
  failed: {
    label: "Agent failed",
    cls: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    icon: XCircle,
    title: "The agent run failed or never reported back — open the deal to re-run it",
  },
  stale: {
    label: "Agent paused",
    cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
        style.cls,
        prep.blocker && prep.status === "needs_input" && "ring-1 ring-amber-500/60",
        onClick ? "cursor-pointer hover:opacity-80" : "cursor-default"
      )}
    >
      <Icon className={cn("h-3 w-3", prep.status === "dispatched" && "animate-spin")} />
      {style.label}
      {flagSuffix}
    </button>
  );
}
