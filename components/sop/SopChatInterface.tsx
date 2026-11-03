"use client";

import { createContext, memo, useCallback, useContext, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, ClipboardList, ExternalLink, FileText, Layers, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { badgeTone } from "@/components/ui/badge";
import { createSopRequest } from "@/hooks/useSops";
import { DocChat, type DocChatSuggestion } from "@/components/doc-chat/DocChat";
import { docConversationToMarkdown, docMessageToMarkdown, sopToolMarkdown } from "@/lib/docChat/exportMarkdown";
import { markOutputSaved, savedOutput } from "@/lib/docChat/store";
import type { ChatMessage, ToolUseBlock } from "@/types/chat";

const SUGGESTIONS: DocChatSuggestion[] = [
  {
    icon: ClipboardList,
    title: "Discovery-call booking SOP",
    description: "Qualification, the booking script, reminders and CRM logging.",
    prompt: "Write an SOP for setters booking discovery calls — qualification criteria, the booking script, calendar handling, confirmation + reminder cadence, and what to log in the CRM.",
  },
  {
    icon: Layers,
    title: "Meta creative-testing SOP",
    description: "Angles, batch sizing, staged elimination and KPIs for the Media Buyer team.",
    prompt: "Write a Standard Operating Procedure for the Media Buyer team to run Meta creative tests: angles, batch sizing, the staged elimination process, KPIs to watch, and how to call winners.",
  },
  {
    icon: Pencil,
    title: "Convert a doc I paste",
    description: "Paste it after this prompt — every step kept, wording tightened.",
    prompt: "Convert this process doc into a clean, structured SOP, preserving every step but tightening the wording:\n\n",
    fill: true,
  },
  {
    icon: BookOpen,
    title: "New-client onboarding SOP",
    description: "Kickoff, access collection, welcome kit and the first 30 days.",
    prompt: "Write an SOP for onboarding a new client: kickoff, access collection, welcome kit, first 30-day milestones, and the owner for each step.",
  },
];

/** The host's "open this SOP in the builder" — via context so the card renderer stays module-level. */
const OpenSopContext = createContext<(id: string) => void>(() => {});

// ─── SOP card (the generate_sop result) ──────────────────────────────────────

const SopCard = memo(function SopCard({ tool }: { tool: ToolUseBlock }) {
  const onOpenSop = useContext(OpenSopContext);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<null | "open" | "save">(null);
  // Saved (or already opened) → the library id, so neither button creates a duplicate.
  const [savedId, setSavedId] = useState<string | null>(() => savedOutput(tool.id) || null);
  const [err, setErr] = useState("");

  const input = tool.input as Record<string, unknown>;
  const title = String(input.title ?? "Untitled SOP");
  const summary = typeof input.summary === "string" ? input.summary : "";
  const sections = Array.isArray(input.sections) ? (input.sections as Record<string, unknown>[]) : [];

  async function ensureSaved(): Promise<string | null> {
    if (savedId) return savedId;
    setErr("");
    try {
      const { id } = await createSopRequest({ doc: input, folder: "AI Generated" });
      markOutputSaved(tool.id, id);
      setSavedId(id);
      queryClient.invalidateQueries({ queryKey: ["sops"] });
      return id;
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Failed to save");
      return null;
    }
  }

  async function handleOpen() {
    setBusy("open");
    const id = await ensureSaved();
    setBusy(null);
    if (id) onOpenSop(id);
  }

  async function handleSave() {
    setBusy("save");
    await ensureSaved();
    setBusy(null);
  }

  return (
    <Card className="min-w-0 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="flex min-w-0 items-start gap-3">
          <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h4 className="break-words text-sm font-semibold tracking-tight">{title}</h4>
            <p className="text-xs text-muted-foreground">
              Generated SOP · {sections.length} section{sections.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {savedId ? (
            <Button size="sm" variant="outline" disabled className={cn("disabled:opacity-100", badgeTone.success)}>
              <Check />
              Saved to library
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleSave} disabled={busy !== null}>
              {busy === "save" ? <Loader2 className="animate-spin" /> : <Check />}
              Save to library
            </Button>
          )}
          <Button size="sm" onClick={handleOpen} disabled={busy !== null}>
            {busy === "open" ? <Loader2 className="animate-spin" /> : savedId ? <ExternalLink /> : <Pencil />}
            Open in builder
          </Button>
        </div>
        {err && (
          <p role="alert" className="w-full text-xs text-destructive">
            {err}
          </p>
        )}
      </div>
      {summary && <p className="border-b bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">{summary}</p>}
      <ol className="max-h-56 space-y-1.5 overflow-y-auto px-4 py-3 text-xs text-muted-foreground">
        {sections.map((s, i) => {
          const blocks = Array.isArray(s.blocks) ? s.blocks.length : 0;
          return (
            <li key={i} className="flex min-w-0 items-baseline gap-2">
              <span className="w-5 shrink-0 tabular-nums">{i + 1}.</span>
              <span className="min-w-0 truncate">
                <span className="font-medium text-foreground">{String(s.title || `Section ${i + 1}`)}</span>
                {` — ${blocks} block${blocks === 1 ? "" : "s"}`}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
});

// ─── Wiring (module-level: the messages are memoized on these) ──────────────

function renderSopTool(tool: ToolUseBlock) {
  return tool.name === "generate_sop" ? <SopCard tool={tool} /> : null;
}

function sopPendingLabel(name: string): string {
  return name === "generate_sop" ? "Writing the SOP…" : "Working…";
}

function sopMessageMarkdown(message: ChatMessage): string {
  return docMessageToMarkdown(message, sopToolMarkdown);
}

function sopConversationMarkdown(messages: ChatMessage[]): string {
  return docConversationToMarkdown(messages, { title: "SOP Assistant conversation", assistantName: "SOP Assistant" }, sopToolMarkdown);
}

export function SopChatInterface({ onOpenSop }: { onOpenSop: (id: string) => void }) {
  // Stable for the cards' context (the host passes a new function every render).
  const openRef = useRef(onOpenSop);
  openRef.current = onOpenSop;
  const openSop = useCallback((id: string) => openRef.current(id), []);

  return (
    <OpenSopContext.Provider value={openSop}>
      <DocChat
        endpoint="/api/sop-chat"
        storeKey="sop-chat"
        title="SOP Assistant"
        icon={ClipboardList}
        emptyTitle="SOP Assistant"
        emptyDescription="Describe a process and Claude drafts a structured SOP you can open in the builder, edit, and save."
        suggestions={SUGGESTIONS}
        placeholder="Describe the process, or paste a doc to convert…"
        disclaimer="AI can make mistakes. Review SOPs before sharing or acting on them."
        exportName="sop-assistant"
        conversationToMarkdown={sopConversationMarkdown}
        renderTool={renderSopTool}
        pendingLabel={sopPendingLabel}
        toMarkdown={sopMessageMarkdown}
      />
    </OpenSopContext.Provider>
  );
}
