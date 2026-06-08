"use client";

import { useState, useRef, useEffect, useCallback, Component, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Square, FileText, Loader2, ClipboardList, Pencil, Layers, BookOpen, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_MODEL } from "@/lib/chatModels";
import { parseSSEStream } from "@/lib/chatStreamParser";
import { createSopRequest } from "@/hooks/useSops";

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: Block[];
}

interface ApiBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

const SUGGESTIONS = [
  { icon: ClipboardList, label: "Discovery-call booking SOP", prompt: "Write an SOP for setters booking discovery calls — qualification criteria, the booking script, calendar handling, confirmation + reminder cadence, and what to log in the CRM." },
  { icon: Layers, label: "Meta creative-testing SOP", prompt: "Write a Standard Operating Procedure for the Media Buyer team to run Meta creative tests: angles, batch sizing, the staged elimination process, KPIs to watch, and how to call winners." },
  { icon: Pencil, label: "Convert a doc I paste", prompt: "I'll paste an existing process doc. Convert it into a clean, structured SOP, preserving every step but tightening the wording." },
  { icon: BookOpen, label: "New-client onboarding SOP", prompt: "Write an SOP for onboarding a new client: kickoff, access collection, welcome kit, first 30-day milestones, and the owner for each step." },
];

const mdComponents = {
  h1: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="text-lg font-bold mt-4 mb-2" {...p} />,
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="text-base font-bold mt-4 mb-2" {...p} />,
  h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="text-sm font-semibold mt-3 mb-1.5" {...p} />,
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => <p className="my-2 leading-relaxed" {...p} />,
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => <ul className="my-2 ml-5 list-disc space-y-1" {...p} />,
  ol: (p: React.HTMLAttributes<HTMLOListElement>) => <ol className="my-2 ml-5 list-decimal space-y-1" {...p} />,
  li: (p: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-relaxed" {...p} />,
  strong: (p: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold text-foreground" {...p} />,
  code: (p: React.HTMLAttributes<HTMLElement>) => <code className="rounded bg-muted px-1 py-0.5 text-xs" {...p} />,
};

function messagesToApi(msgs: Message[]): Array<{ role: "user" | "assistant"; content: string | ApiBlock[] }> {
  const out: Array<{ role: "user" | "assistant"; content: string | ApiBlock[] }> = [];
  for (const msg of msgs) {
    if (msg.role === "user") {
      out.push({ role: "user", content: msg.content });
      continue;
    }
    if (!msg.blocks || msg.blocks.length === 0) {
      if (msg.content) out.push({ role: "assistant", content: msg.content });
      continue;
    }
    const resultIds = new Set(
      msg.blocks.filter((b) => b.type === "tool_result").map((b) => (b as { tool_use_id: string }).tool_use_id)
    );
    const pairedUseIds = new Set<string>();
    const assistant: ApiBlock[] = [];
    const toolResults: ApiBlock[] = [];
    const continuation: ApiBlock[] = [];
    let seenResult = false;
    for (const b of msg.blocks) {
      if (b.type === "text") {
        if (!b.text) continue;
        (seenResult ? continuation : assistant).push({ type: "text", text: b.text });
      } else if (b.type === "tool_use") {
        if (!resultIds.has(b.id)) continue;
        pairedUseIds.add(b.id);
        assistant.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
      } else if (b.type === "tool_result") {
        if (!pairedUseIds.has(b.tool_use_id)) continue;
        seenResult = true;
        toolResults.push({ type: "tool_result", tool_use_id: b.tool_use_id, content: b.content });
      }
    }
    if (assistant.length) out.push({ role: "assistant", content: assistant });
    if (toolResults.length) out.push({ role: "user", content: toolResults });
    if (continuation.length) out.push({ role: "assistant", content: continuation });
  }
  return out;
}

// ─── SOP card (the generate_sop result) ──────────────────────────────────────

function SopCard({ input, onOpenSop }: { input: Record<string, unknown>; onOpenSop: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<null | "open" | "save">(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const title = String(input.title ?? "Untitled SOP");
  const summary = input.summary ? String(input.summary) : "";
  const sections = Array.isArray(input.sections) ? (input.sections as Record<string, unknown>[]) : [];

  async function create(): Promise<string | null> {
    setErr("");
    try {
      const { id } = await createSopRequest({ doc: input, folder: "AI Generated" });
      queryClient.invalidateQueries({ queryKey: ["sops"] });
      return id;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
      return null;
    }
  }

  async function handleOpen() {
    setBusy("open");
    const id = await create();
    setBusy(null);
    if (id) onOpenSop(id);
  }

  async function handleSave() {
    setBusy("save");
    const id = await create();
    setBusy(null);
    if (id) setSavedId(id);
  }

  return (
    <div className="my-3 rounded-2xl border border-primary/30 bg-primary/[0.03] overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Generated SOP · {sections.length} section{sections.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {savedId ? (
            <button
              onClick={() => onOpenSop(savedId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save to library
            </button>
          )}
          <button
            onClick={handleOpen}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy === "open" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
            Open in builder
          </button>
        </div>
      </div>
      {summary && <div className="border-b border-border/50 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">{summary}</div>}
      <div className="max-h-48 overflow-y-auto px-4 py-3 text-xs text-muted-foreground">
        <ul className="space-y-1">
          {sections.map((s, i) => (
            <li key={i} className="truncate">
              <span className="font-semibold text-foreground">{String(s.title ?? `Section ${i + 1}`)}</span>
              {Array.isArray(s.blocks) ? ` — ${(s.blocks as unknown[]).length} block${(s.blocks as unknown[]).length === 1 ? "" : "s"}` : ""}
            </li>
          ))}
        </ul>
      </div>
      {err && <p className="px-4 pb-3 text-xs text-destructive">{err}</p>}
    </div>
  );
}

class ToolErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: unknown) { console.error("[sop-chat] tool render error:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="my-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          This generated SOP couldn&apos;t be displayed.
        </div>
      );
    }
    return this.props.children;
  }
}

function AssistantBlocks({ blocks, onOpenSop }: { blocks: Block[]; onOpenSop: (id: string) => void }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "text") {
          if (!b.text) return null;
          return (
            <div key={i} className="text-sm text-foreground">
              <ReactMarkdown components={mdComponents}>{b.text}</ReactMarkdown>
            </div>
          );
        }
        if (b.type === "tool_use" && b.name === "generate_sop") {
          return (
            <ToolErrorBoundary key={i}>
              <SopCard input={b.input} onOpenSop={onOpenSop} />
            </ToolErrorBoundary>
          );
        }
        return null;
      })}
    </>
  );
}

export function SopChatInterface({ onOpenSop }: { onOpenSop: (id: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading || sendingRef.current) return;
      sendingRef.current = true;

      const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
      const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", content: "", blocks: [] };
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setIsLoading(true);
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const apiMessages = messagesToApi([...messages, userMessage]);
        const res = await fetch("/api/sop-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, model: DEFAULT_MODEL }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        for await (const event of parseSSEStream(res.body!)) {
          if (controller.signal.aborted) break;
          if (event.type === "text_delta") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const blocks = [...(last.blocks ?? [])];
              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock?.type === "text") {
                blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + event.text };
              } else {
                blocks.push({ type: "text", text: event.text });
              }
              return [...prev.slice(0, -1), { ...last, content: last.content + event.text, blocks }];
            });
          } else if (event.type === "tool_use") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const blocks = [...(last.blocks ?? [])];
              blocks.push({ type: "tool_use", id: event.id, name: event.name, input: event.input });
              return [...prev.slice(0, -1), { ...last, blocks }];
            });
          } else if (event.type === "tool_result") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const blocks = [...(last.blocks ?? [])];
              blocks.push({ type: "tool_result", tool_use_id: event.tool_use_id, content: String(event.result ?? "") });
              return [...prev.slice(0, -1), { ...last, blocks }];
            });
          } else if (event.type === "error") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const blocks = [...(last.blocks ?? [])];
              blocks.push({ type: "text", text: `\n\n*Error: ${event.message}*` });
              return [...prev.slice(0, -1), { ...last, content: last.content + `\n\n*Error: ${event.message}*`, blocks }];
            });
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const errorText = err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          const blocks = [...(last.blocks ?? [])];
          blocks.push({ type: "text", text: `*Error: ${errorText}*` });
          return [...prev.slice(0, -1), { ...last, content: `*Error: ${errorText}*`, blocks }];
        });
      } finally {
        setIsLoading(false);
        sendingRef.current = false;
        abortRef.current = null;
      }
    },
    [messages, isLoading]
  );

  function handleStop() {
    abortRef.current?.abort();
    setIsLoading(false);
    sendingRef.current = false;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const lastMsg = messages[messages.length - 1];
  const isThinking = isLoading && lastMsg?.role === "assistant" && (!lastMsg.blocks || lastMsg.blocks.length === 0);

  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-[24rem] flex-col rounded-2xl border border-border/50 bg-card overflow-hidden md:h-[calc(100vh-16rem)] md:min-h-[28rem]">
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-4">
        <ClipboardList className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">SOP Assistant</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 space-y-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-xl">
              <ClipboardList className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">SOP Assistant</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Describe a process and Claude drafts a structured SOP you can open in the builder, edit, and save.
              </p>
            </div>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.prompt)}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-background p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-xs font-medium text-foreground">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            if (isThinking && i === messages.length - 1) return null;
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {msg.content}
                  </div>
                </div>
              );
            }
            return (
              <div key={msg.id} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <ClipboardList className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <AssistantBlocks blocks={msg.blocks ?? []} onOpenSop={onOpenSop} />
                </div>
              </div>
            );
          })
        )}
        {isThinking && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <ClipboardList className="h-4 w-4 animate-pulse text-primary" />
            </div>
            <div className="flex items-center gap-1.5 pt-2">
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:py-3">
        <div className="relative flex items-end gap-2 rounded-2xl border border-border/50 bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe the process, or paste a doc to convert…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            style={{ maxHeight: "160px" }}
          />
          {isLoading ? (
            <button onClick={handleStop} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20" title="Stop">
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors", input.trim() ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed")}
              title="Send (Enter)"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          AI can make mistakes. Review SOPs before sharing or acting on them.
        </p>
      </div>
    </div>
  );
}
