"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Copy, GraduationCap, Loader2, RotateCcw, Save, X } from "lucide-react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { cn } from "@/lib/utils";
import { prepareDealsPrompt } from "@/lib/dealPrepPrompts";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/use-confirm";

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
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        title="How the deal-prep agent builds invoices and contracts"
        aria-label="Agent playbook"
      >
        <Bot />
        <span className="hidden sm:inline">Agent playbook</span>
      </Button>
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
  const { confirm, dialog } = useConfirm();

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

  async function requestClose() {
    if (busy) return;
    if (dirty && !(await confirm({ title: "Discard your playbook changes?", destructive: true, confirmText: "Discard" }))) return;
    onClose();
  }
  useEscapeKey(requestClose);

  async function write(method: "PUT" | "DELETE") {
    if (method === "DELETE" && !(await confirm({ title: "Reset the playbook to the built-in default?", destructive: true, confirmText: "Reset" }))) return;
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

  // Portaled to <body> (z-50, like the overlay) so the confirm prompts — z-50
  // portals — layer above it.
  return createPortal(
    <>
      <div className={dialogOverlayClass} onClick={requestClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deal-prep-playbook-title"
          className={cn(dialogPanelClass, "pointer-events-auto relative w-full max-w-3xl mx-4 max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden")}
        >
          <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b">
            <div className="min-w-0">
              <h3 id="deal-prep-playbook-title" className="text-base font-semibold tracking-tight">
                Deal-prep agent playbook
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                The rules the agent follows when it pre-builds a closed deal&apos;s invoice and contract. Recently sent deals are
                attached to every run as examples, so current practice wins when this text is out of date.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={requestClose}
              disabled={busy}
              aria-label="Close"
              className="-mr-2 shrink-0"
            >
              <X />
            </Button>
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
                  <StatusBadge tone={data.autoRun ? "success" : "info"} className="h-auto whitespace-normal py-0.5">
                    <Bot className="opacity-70" />
                    {data.autoRun ? "Automatic — the agent runs on every closed deal" : "Manual — you start runs from Claude"}
                  </StatusBadge>
                  <span className="text-muted-foreground">
                    {data.exemplars} past deal{data.exemplars === 1 ? "" : "s"} recorded as examples
                  </span>
                  {data.isDefault && <span className="text-muted-foreground">· built-in default playbook</span>}
                </div>

                <div className="rounded-2xl bg-muted/50 p-4 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">
                      Run in Claude
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        · {data.awaiting} deal{data.awaiting === 1 ? "" : "s"} awaiting prep
                      </span>
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={copyPrompt}>
                      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                      {copied ? "Copied" : "Copy prompt"}
                    </Button>
                  </div>
                  <p className="text-muted-foreground">
                    In Claude with the Agency Collective connector, pick its <span className="font-medium text-foreground">Prepare deals awaiting review</span>{" "}
                    prompt (or <span className="font-medium text-foreground">Prepare one deal</span> for a specific deal) — or paste this. Awaiting = deals closed in the
                    last 30 days with a draft invoice that the agent hasn&apos;t prepared, plus deals re-queued after a change.
                  </p>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-background p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {prepareDealsPrompt()}
                  </pre>
                </div>

                <Textarea
                  value={text ?? ""}
                  onChange={(e) => setText(e.target.value)}
                  spellCheck={false}
                  className="min-h-[22rem] resize-y font-mono text-xs leading-relaxed md:text-xs"
                  aria-label="Playbook"
                />

                <div className="rounded-2xl bg-muted/50 p-4 text-xs text-muted-foreground space-y-2">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <GraduationCap className="size-4 text-muted-foreground" />
                    Learn from past deals
                  </p>
                  <p>
                    Every invoice you send is recorded automatically (with your corrections to the agent&apos;s draft). Run this
                    once to also record deals closed in the last 30 days that were sent before the agent existed — it reads their invoices
                    and per-deal contract edits; nothing is changed.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={learn} disabled={busy}>
                    {learning && learning.remaining !== 0 ? <Loader2 className="size-3.5 animate-spin" /> : <GraduationCap className="size-3.5" />}
                    {learning && learning.remaining !== 0
                      ? `Learning… ${learning.captured} recorded${learning.remaining != null ? `, ${learning.remaining} left` : ""}`
                      : "Learn from past deals"}
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="border-t px-4 sm:px-6 py-3 space-y-2">
            {msg && (
              <div
                role="status"
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-medium",
                  msg.type === "success" ? "bg-muted/50" : "bg-destructive/10 text-destructive"
                )}
              >
                {msg.type === "success" && <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />}
                {msg.text}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => write("DELETE")}
                disabled={busy || !data || data.isDefault}
              >
                <RotateCcw className="size-3.5" />
                Reset to default
              </Button>
              {dirty && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => write("PUT")}
                disabled={busy || !dirty || !text?.trim()}
                className="ml-auto"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Save playbook
              </Button>
            </div>
          </div>
        </div>
      </div>
      {dialog}
    </>,
    document.body
  );
}
