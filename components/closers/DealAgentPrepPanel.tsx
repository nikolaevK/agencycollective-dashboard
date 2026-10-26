"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, Bot, ExternalLink, Info, Loader2, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DealPrepStatus } from "@/lib/dealPrepRules";

interface PrepFlag {
  severity: "info" | "warning" | "blocker";
  message: string;
}

interface PrepPayload {
  /** A routine runs the agent per deal; otherwise runs are started by hand in Claude. */
  autoRun: boolean;
  prep: {
    status: DealPrepStatus;
    summary: string | null;
    flags: PrepFlag[];
    error: string | null;
    sessionUrl: string | null;
    finishedAt: string | null;
    attempts: number;
  } | null;
}

const HEADLINE: Record<DealPrepStatus, string> = {
  queued: "Queued for the agent",
  dispatched: "The agent is preparing this deal…",
  ready: "Prepared by the agent — review and send",
  needs_input: "Prepared by the agent — needs your decision",
  failed: "The agent run failed",
  stale: "The agent left this deal to you",
  sent: "Sent",
};

/**
 * Invoice drawer header block for the deal-prep agent: what it did and why
 * (its summary), what it was unsure about (flags), and Re-run (auto mode
 * fires the routine; manual mode queues the deal for the next run in Claude).
 * Hidden until the agent has touched the deal (auto mode: offers "Run agent").
 */
export function DealAgentPrepPanel({
  dealId,
  invoiceSent,
  onPrepared,
}: {
  dealId: string;
  invoiceSent: boolean;
  /** A run finished while the drawer was open — reload the paperwork it wrote. */
  onPrepared?: () => void;
}) {
  const queryClient = useQueryClient();
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery<PrepPayload>({
    queryKey: ["deal-prep", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deals/${dealId}/prep`);
      if (!res.ok) throw new Error(`Failed to load agent prep: ${res.status}`);
      return (await res.json()).data;
    },
    // Poll only while a run is in flight (the agent reports back via MCP).
    refetchInterval: (q) => {
      const s = q.state.data?.prep?.status;
      return s === "dispatched" || s === "queued" ? 15_000 : false;
    },
  });

  // Fire onPrepared on the working → finished transition only (not on open).
  const lastStatus = useRef<DealPrepStatus | null | undefined>(undefined);
  const currentStatus = data?.prep?.status ?? null;
  useEffect(() => {
    const prev = lastStatus.current;
    lastStatus.current = currentStatus;
    if ((prev === "dispatched" || prev === "queued") && (currentStatus === "ready" || currentStatus === "needs_input")) {
      onPrepared?.();
      queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
    }
  }, [currentStatus, onPrepared, queryClient]);

  if (!data || invoiceSent) return null;
  const prep = data.prep;
  if (!prep && !data.autoRun) return null;

  async function rerun() {
    const destructive = prep && (prep.status === "ready" || prep.status === "needs_input" || prep.status === "stale");
    const question = data?.autoRun
      ? "Re-run the agent? It rewrites this deal's draft invoices and unsent contracts — unsaved edits here are lost."
      : "Queue this deal for the next deal-prep run in Claude? That run rewrites its draft invoices and unsent contracts.";
    if (destructive && !window.confirm(question)) {
      return;
    }
    setRerunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/prep`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Couldn't start the agent");
        return;
      }
      queryClient.setQueryData(["deal-prep", dealId], json.data);
      queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setRerunning(false);
    }
  }

  const status = prep?.status ?? null;
  const tone =
    status === "ready"
      ? "border-violet-500/30 bg-violet-500/5"
      : status === "needs_input" || status === "stale"
        ? "border-amber-500/40 bg-amber-500/5"
        : status === "failed"
          ? "border-red-500/30 bg-red-500/5"
          : "border-border/60 bg-muted/30";

  return (
    <div className={cn("rounded-lg border px-3 py-2.5 space-y-2", tone)}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {status === "dispatched" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
          {status ? HEADLINE[status] : "Deal-prep agent"}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {prep?.sessionUrl && (
            <a
              href={prep.sessionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              title="Open the agent's Claude session"
            >
              <ExternalLink className="h-3 w-3" />
              Session
            </a>
          )}
          {status !== "dispatched" && (data.autoRun || (status !== null && status !== "queued")) && (
            <button
              type="button"
              onClick={rerun}
              disabled={rerunning}
              title={data.autoRun ? "Start a new agent run for this deal" : "Mark this deal for the next deal-prep run in Claude"}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent disabled:opacity-60"
            >
              {rerunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              {data.autoRun ? (prep ? "Re-run agent" : "Run agent") : "Queue re-run"}
            </button>
          )}
        </div>
      </div>

      {status === "queued" && !data.autoRun && (
        <p className="text-xs text-muted-foreground">
          Prepared the next time someone runs <span className="font-medium text-foreground">Prepare deals awaiting review</span> in
          Claude (Agency Collective connector).
        </p>
      )}
      {status === "stale" && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          This deal&apos;s paperwork was edited by a person, so the agent won&apos;t overwrite it. Re-run it to let the agent
          rebuild the paperwork, or finish it by hand.
        </p>
      )}
      {prep?.error && (status === "failed" || status === "queued") && (
        <p className="text-xs text-red-600 dark:text-red-400">{prep.error}</p>
      )}

      {prep?.flags && prep.flags.length > 0 && (status === "ready" || status === "needs_input" || status === "stale") && (
        <ul className="space-y-1">
          {prep.flags.map((f, i) => {
            const Icon = f.severity === "blocker" ? XCircle : f.severity === "warning" ? AlertTriangle : Info;
            return (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-1.5 text-xs",
                  f.severity === "blocker"
                    ? "text-red-700 dark:text-red-400"
                    : f.severity === "warning"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="break-words [overflow-wrap:anywhere]">{f.message}</span>
              </li>
            );
          })}
        </ul>
      )}

      {prep?.summary && (status === "ready" || status === "needs_input" || status === "stale") && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
            What the agent did
          </summary>
          <div className="prose prose-sm dark:prose-invert max-w-none mt-1.5 text-xs leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0 break-words [overflow-wrap:anywhere]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{prep.summary}</ReactMarkdown>
          </div>
        </details>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
