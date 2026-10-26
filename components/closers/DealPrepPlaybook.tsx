"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Copy, GraduationCap, Loader2, RotateCcw, Save } from "lucide-react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { cn } from "@/lib/utils";
import { prepareDealsPrompt } from "@/lib/dealPrepPrompts";

interface PlaybookPayload {
  text: string;
  isDefault: boolean;
  /** A routine runs the agent per deal; otherwise runs are started in Claude. */
  autoRun: boolean;
  /** Deals awaiting prep (listDealPreps status=queued). */
  awaiting: number;
  exemplars: number;
}

const QUERY_KEY = ["deal-prep-playbook"];

/**
 * Deal queue header → "Agent playbook": how to start a run in Claude (deals
 * awaiting prep + the prompt to paste), the agent's editable business rules
 * (lib/dealPrepPlaybook.ts), and "Learn from past deals", which records what
 * was actually sent for past deals as the agent's examples.
 */
export function DealPrepPlaybookButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="How the deal-prep agent builds invoices and contracts"
        aria-label="Agent playbook"
      >
        <Bot className="h-4 w-4" />
        <span className="hidden sm:inline">Agent playbook</span>
      </button>
      {open && <PlaybookModal onClose={() => setOpen(false)} />}
    </>
  );
}

function PlaybookModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<PlaybookPayload>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/admin/deals/prep-playbook");
      if (!res.ok) throw new Error(`Failed to load playbook: ${res.status}`);
      return (await res.json()).data;
    },
  });
  const [text, setText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [learning, setLearning] = useState<{ captured: number; remaining: number | null } | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prepareDealsPrompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg({ type: "error", text: "Couldn't copy — select the prompt text and copy it manually" });
    }
  }

  useEffect(() => {
    if (data && text === null) setText(data.text);
  }, [data, text]);

  const dirty = data != null && text != null && text !== data.text;
  const busy = saving || (learning != null && learning.remaining !== 0);

  function requestClose() {
    if (busy) return;
    if (dirty && !window.confirm("Discard your playbook changes?")) return;
    onClose();
  }
  useEscapeKey(requestClose);

  async function write(method: "PUT" | "DELETE") {
    if (method === "DELETE" && !window.confirm("Reset the playbook to the built-in default?")) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/deals/prep-playbook", {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "PUT" ? { body: JSON.stringify({ text }) } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: "error", text: json.error ?? "Couldn't save the playbook" });
        return;
      }
      queryClient.setQueryData(QUERY_KEY, json.data);
      setText(json.data.text);
      setMsg({ type: "success", text: method === "PUT" ? "Playbook saved — the next agent run uses it" : "Playbook reset to the default" });
    } catch {
      setMsg({ type: "error", text: "Couldn't reach the server" });
    } finally {
      setSaving(false);
    }
  }

  async function learn() {
    setMsg(null);
    let captured = 0;
    let failed = 0;
    let cursor: unknown = null;
    setLearning({ captured, remaining: null });
    try {
      // One batch per request (DocuSeal reads), walking newest → oldest until
      // the server says there is nothing after the cursor.
      for (let i = 0; i < 200; i++) {
        const res = await fetch("/api/admin/deals/prep-exemplars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Learning failed");
        captured += json.data.captured;
        failed += json.data.failed;
        setLearning({ captured, remaining: json.data.remaining });
        cursor = json.data.next;
        if (!cursor) break;
      }
      setLearning((l) => (l ? { ...l, remaining: 0 } : l));
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setMsg({
        type: failed > 0 && captured === 0 ? "error" : "success",
        text:
          `Recorded ${captured} past deal${captured === 1 ? "" : "s"} as examples` +
          (failed > 0 ? ` — ${failed} couldn't be read from DocuSeal; run this again later to retry them` : ""),
      });
    } catch (err) {
      setLearning((l) => (l ? { ...l, remaining: 0 } : l));
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Learning failed" });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={requestClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-prep-playbook-title"
        className="relative w-full max-w-3xl mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[calc(100dvh-2rem)] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border">
          <div className="min-w-0">
            <h3 id="deal-prep-playbook-title" className="text-lg font-semibold text-foreground">
              Deal-prep agent playbook
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              The rules the agent follows when it pre-builds a closed deal&apos;s invoice and contract. Recently sent deals are
              attached to every run as examples, so current practice wins when this text is out of date.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <span aria-hidden>&times;</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError || !data ? (
            <p className="text-sm text-destructive">Couldn&apos;t load the playbook.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                    data.autoRun
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                  )}
                >
                  <Bot className="h-3 w-3" />
                  {data.autoRun ? "Automatic — the agent runs on every closed deal" : "Manual — you start runs from Claude"}
                </span>
                <span className="text-muted-foreground">
                  {data.exemplars} past deal{data.exemplars === 1 ? "" : "s"} recorded as examples
                </span>
                {data.isDefault && <span className="text-muted-foreground">· built-in default playbook</span>}
              </div>

              <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">
                    Run in Claude
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      · {data.awaiting} deal{data.awaiting === 1 ? "" : "s"} awaiting prep
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={copyPrompt}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 font-medium text-foreground hover:bg-accent"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy prompt"}
                  </button>
                </div>
                <p className="text-muted-foreground">
                  In Claude with the Agency Collective connector, pick its <span className="font-medium text-foreground">Prepare deals awaiting review</span>{" "}
                  prompt (or <span className="font-medium text-foreground">Prepare one deal</span> for a specific deal) — or paste this. Awaiting = deals closed in the
                  last 30 days with a draft invoice that the agent hasn&apos;t prepared, plus deals re-queued after a change.
                </p>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {prepareDealsPrompt()}
                </pre>
              </div>

              <textarea
                value={text ?? ""}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                className="w-full min-h-[22rem] rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Playbook"
              />

              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Learn from past deals
                </p>
                <p>
                  Every invoice you send is recorded automatically (with your corrections to the agent&apos;s draft). Run this
                  once to also record deals closed in the last 30 days that were sent before the agent existed — it reads their invoices
                  and per-deal contract edits; nothing is changed.
                </p>
                <button
                  type="button"
                  onClick={learn}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 font-medium text-foreground hover:bg-accent disabled:opacity-60"
                >
                  {learning && learning.remaining !== 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
                  {learning && learning.remaining !== 0
                    ? `Learning… ${learning.captured} recorded${learning.remaining != null ? `, ${learning.remaining} left` : ""}`
                    : "Learn from past deals"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-border px-4 sm:px-6 py-3 space-y-2">
          {msg && (
            <div
              role="status"
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-medium",
                msg.type === "success"
                  ? "bg-emerald-500/5 text-emerald-600 border border-emerald-500/30"
                  : "bg-destructive/5 text-destructive border border-destructive/30"
              )}
            >
              {msg.text}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => write("DELETE")}
              disabled={busy || !data || data.isDefault}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to default
            </button>
            {dirty && <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>}
            <button
              type="button"
              onClick={() => write("PUT")}
              disabled={busy || !dirty || !text?.trim()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white ac-gradient disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save playbook
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
