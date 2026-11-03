"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Download, Send, Square, SquarePen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/use-confirm";
import { useToast } from "@/components/providers/ToastProvider";
import { useAdmin } from "@/components/providers/AdminProvider";
import { CHAT_MODELS, DEFAULT_MODEL, type ChatModelId } from "@/lib/chatModels";
import { parseSSEStream } from "@/lib/chatStreamParser";
import { buildApiHistory } from "@/lib/analyst/history";
import { finishStreamLocally, initialStreamState, type PendingTool, type StreamState } from "@/lib/analyst/streamReducer";
import { reduceDocChatEvent } from "@/lib/docChat/stream";
import { loadConversation, saveConversation } from "@/lib/docChat/store";
import { DOC_CHAT_HISTORY_BUDGET, DOC_CHAT_MAX_INPUT_CHARS } from "@/lib/docChat/limits";
import type { ChatMessage } from "@/types/chat";
import { DocChatMessage, preloadDocChatMarkdown, type DocChatRenderers } from "./DocChatMessage";

/**
 * Chat shell for the document assistants (Media Buyers, SOPs) — the AI
 * Analyst's chat (components/chat/ChatInterface) without its data-context
 * picker: batched streaming, Stop / Retry / Continue, pinned scrolling,
 * history repaired + trimmed to budget before every send, conversation kept
 * across tab switches (lib/docChat/store).
 */

export interface DocChatSuggestion {
  icon: LucideIcon;
  title: string;
  description: string;
  prompt: string;
  /** Put the prompt in the composer instead of sending it (the user pastes next). */
  fill?: boolean;
}

export interface DocChatProps extends DocChatRenderers {
  /** POST endpoint (SSE). */
  endpoint: string;
  /** Conversation cache key (per admin). */
  storeKey: string;
  title: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  suggestions: DocChatSuggestion[];
  placeholder: string;
  disclaimer: string;
  /** File-name prefix of the exported conversation. */
  exportName: string;
  /** The whole conversation as markdown (Export). */
  conversationToMarkdown: (messages: ChatMessage[]) => string;
}

const STREAM_FLUSH_MS = 50;
const COUNTER_FROM = Math.floor(DOC_CHAT_MAX_INPUT_CHARS * 0.8);

function EmptyState({
  icon: Icon,
  title,
  description,
  suggestions,
  onPick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  suggestions: DocChatSuggestion[];
  onPick: (s: DocChatSuggestion) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 py-6 text-center md:py-10">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => {
          const SIcon = s.icon;
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => onPick(s)}
              className="flex min-w-0 items-start gap-3 rounded-3xl border bg-background p-3.5 text-left outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 dark:bg-transparent dark:hover:bg-input/30"
            >
              <SIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{s.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DocChat({
  endpoint,
  storeKey,
  title,
  icon,
  emptyTitle,
  emptyDescription,
  suggestions,
  placeholder,
  disclaimer,
  exportName,
  conversationToMarkdown,
  renderTool,
  pendingLabel,
  toMarkdown,
}: DocChatProps) {
  const { adminId } = useAdmin();
  const { toastError } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const cacheKey = `${storeKey}:${adminId}`;

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation(cacheKey));
  const [pendingTools, setPendingTools] = useState<PendingTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ChatModelId>(DEFAULT_MODEL);
  const [elapsed, setElapsed] = useState(0);
  const [pinned, setPinned] = useState(true);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  const streamRef = useRef<StreamState | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pinnedRef = useRef(true);

  const modelLabel = (CHAT_MODELS.find((m) => m.id === model) ?? CHAT_MODELS[0]).label;
  const tooLong = input.length > DOC_CHAT_MAX_INPUT_CHARS;

  // ── Conversation cache (survives the host unmounting this tab) ──
  useEffect(() => {
    if (!isLoading) saveConversation(cacheKey, messages);
  }, [cacheKey, messages, isLoading]);

  useEffect(
    () => () => {
      // Leaving mid-reply: keep what streamed (marked stopped), then abort.
      const live = streamRef.current;
      if (live) {
        const final = finishStreamLocally(live, "stopped", "Stopped — you left the assistant.").message;
        saveConversation(
          cacheKeyRef.current,
          messagesRef.current.map((m) => (m.id === final.id ? final : m))
        );
        streamRef.current = null;
      }
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      abortRef.current?.abort();
    },
    []
  );

  // ── Scrolling: follow the reply only while the reader is at the bottom ──
  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    pinnedRef.current = atBottom;
    setPinned(atBottom);
  }, []);

  // Scrolls the list itself (scrollIntoView would also scroll the page around it).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (messages.length === 0) el.scrollTop = 0;
    else if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, pendingTools]);

  const scrollToEnd = useCallback(() => {
    pinnedRef.current = true;
    setPinned(true);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    preloadDocChatMarkdown();
    // Focus the composer on open — not on touch screens (it would pop the keyboard).
    if (window.matchMedia?.("(pointer: fine)").matches) textareaRef.current?.focus({ preventScroll: true });
  }, []);

  // Elapsed-time counter for the working line — only while a reply streams.
  useEffect(() => {
    if (!isLoading) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLoading]);

  // ── Streaming state → React state, batched (~20 renders/s instead of one per token) ──
  const flush = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const state = streamRef.current;
    if (!state) return;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === state.message.id);
      if (idx < 0) return prev;
      const next = prev.slice();
      next[idx] = state.message;
      return next;
    });
    setPendingTools(state.pendingTools);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flush, STREAM_FLUSH_MS);
  }, [flush]);

  const sendMessage = useCallback(
    async (text: string, base?: ChatMessage[]) => {
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > DOC_CHAT_MAX_INPUT_CHARS || busyRef.current) return; // ref guard: no double-send
      busyRef.current = true;

      const history = base ?? messagesRef.current;
      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
      const stream = initialStreamState(crypto.randomUUID());
      streamRef.current = stream;
      stoppedRef.current = false;
      startedAtRef.current = Date.now();
      setElapsed(0);
      pinnedRef.current = true;
      setPinned(true);
      setMessages([...history, userMessage, stream.message]);
      setPendingTools([]);
      setInput("");
      setIsLoading(true);
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const controller = new AbortController();
      abortRef.current = controller;
      const apply = (s: StreamState) => {
        // A reply abandoned on unmount stays as saved.
        if (streamRef.current?.message.id !== s.message.id) return;
        streamRef.current = s;
        scheduleFlush();
      };

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Converted, tool pairs repaired, oldest exchanges trimmed to budget.
            messages: buildApiHistory([...history, userMessage], DOC_CHAT_HISTORY_BUDGET),
            model,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(typeof errBody.error === "string" ? errBody.error : `Request failed (HTTP ${res.status})`);
        }
        for await (const event of parseSSEStream(res.body)) {
          if (controller.signal.aborted || !streamRef.current) break;
          apply(reduceDocChatEvent(streamRef.current, event));
        }
        if (controller.signal.aborted) {
          // Stop landed between two events (the loop broke instead of throwing).
          if (stoppedRef.current && streamRef.current) apply(finishStreamLocally(streamRef.current, "stopped", "Stopped."));
        } else if (streamRef.current && !streamRef.current.finished) {
          // The stream ended without `done` / `error` (dropped connection, platform timeout).
          apply(finishStreamLocally(streamRef.current, "error", "The connection was interrupted before the reply finished."));
        }
      } catch (err) {
        if (controller.signal.aborted) {
          if (stoppedRef.current && streamRef.current) apply(finishStreamLocally(streamRef.current, "stopped", "Stopped."));
        } else if (streamRef.current) {
          const message = err instanceof Error && err.message ? err.message : "Something went wrong.";
          apply(finishStreamLocally(streamRef.current, "error", message));
        }
      } finally {
        flush();
        if (streamRef.current?.message.id === stream.message.id) streamRef.current = null;
        if (abortRef.current === controller) abortRef.current = null;
        busyRef.current = false;
        setIsLoading(false);
      }
    },
    [endpoint, model, scheduleFlush, flush]
  );

  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
  }, []);

  /** Regenerate: drop the last reply and send its request again. */
  const handleRetry = useCallback(() => {
    if (busyRef.current) return;
    const msgs = messagesRef.current;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        void sendMessage(msgs[i].content, msgs.slice(0, i));
        return;
      }
    }
  }, [sendMessage]);

  const handleContinue = useCallback(() => {
    void sendMessage("Continue where you left off.");
  }, [sendMessage]);

  const handleNewChat = useCallback(async () => {
    if (messagesRef.current.length === 0) return;
    const ok = await confirm({
      title: "Start a new chat?",
      description: "This conversation will be cleared. Save or export anything you want to keep first.",
      confirmText: "New chat",
    });
    if (!ok) return;
    streamRef.current = null;
    abortRef.current?.abort();
    setMessages([]);
    setPendingTools([]);
    setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0);
  }, [confirm]);

  const handleExport = useCallback(() => {
    const msgs = messagesRef.current;
    if (msgs.length === 0) return;
    try {
      const md = conversationToMarkdown(msgs);
      const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toastError("Couldn't export the conversation.");
    }
  }, [conversationToMarkdown, exportName, toastError]);

  const pickSuggestion = useCallback(
    (s: DocChatSuggestion) => {
      if (!s.fill) {
        void sendMessage(s.prompt);
        return;
      }
      setInput(s.prompt);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
      });
    },
    [sendMessage]
  );

  // ── Composer ──
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!isLoading) void sendMessage(input);
    } else if (e.key === "Escape" && isLoading) {
      e.preventDefault();
      handleStop();
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  }

  const lastIndex = messages.length - 1;
  const lastAssistantIndex = messages[lastIndex]?.role === "assistant" ? lastIndex : -1;
  const Icon = icon;

  return (
    // Mobile: leaves room for the page header above and the bottom nav (~96px + safe area) below.
    <Card className="flex h-[calc(100dvh-20rem-env(safe-area-inset-bottom))] min-h-[22rem] min-w-0 flex-col md:h-[calc(100dvh-16rem)] md:min-h-[28rem]">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 md:px-4 md:py-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 truncate text-sm font-medium">{title}</p>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {CHAT_MODELS.length > 1 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ChatModelId)}
              disabled={isLoading}
              aria-label="Claude model"
              className="h-7 rounded-4xl border bg-transparent px-2.5 text-xs text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50"
            >
              {CHAT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          ) : (
            <Badge variant="outline" className="hidden text-muted-foreground sm:inline-flex" title="Claude model">
              {modelLabel}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleExport}
            disabled={messages.length === 0}
            aria-label="Export conversation as Markdown"
            title="Export conversation (.md)"
            className="text-muted-foreground"
          >
            <Download />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleNewChat}
            disabled={messages.length === 0}
            aria-label="New chat"
            title="New chat"
            className="text-muted-foreground"
          >
            <SquarePen />
          </Button>
        </div>
      </div>

      {/* The "Latest" button sits over the list's bottom edge, so it never covers the composer. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={listRef} onScroll={handleListScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
          {messages.length === 0 ? (
            <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} suggestions={suggestions} onPick={pickSuggestion} />
          ) : (
            <div className="mx-auto w-full max-w-4xl space-y-6">
              {messages.map((msg, i) => {
                const streaming = isLoading && i === lastIndex && msg.role === "assistant";
                return (
                  <DocChatMessage
                    key={msg.id}
                    message={msg}
                    assistantIcon={icon}
                    isStreaming={streaming}
                    pendingTools={streaming ? pendingTools : undefined}
                    elapsedSeconds={streaming ? elapsed : undefined}
                    onRetry={!isLoading && i === lastAssistantIndex ? handleRetry : undefined}
                    onContinue={!isLoading && i === lastAssistantIndex ? handleContinue : undefined}
                    renderTool={renderTool}
                    pendingLabel={pendingLabel}
                    toMarkdown={toMarkdown}
                  />
                );
              })}
            </div>
          )}
        </div>

        {!pinned && messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={scrollToEnd} className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 shadow-md">
            <ArrowDown />
            Latest
          </Button>
        )}
      </div>

      <form
        className="shrink-0 border-t p-2 md:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isLoading) void sendMessage(input);
        }}
      >
        <div className="mx-auto w-full max-w-4xl">
          <div
            className={cn(
              "rounded-3xl border border-transparent bg-input/50 transition-[color,box-shadow,border-color] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
              tooLong && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20"
            )}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onFocus={preloadDocChatMarkdown}
              placeholder={placeholder}
              aria-label={`Message the ${title}`}
              aria-invalid={tooLong || undefined}
              aria-describedby={input.length > COUNTER_FROM ? `${storeKey}-counter` : undefined}
              rows={1}
              className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <p
                id={`${storeKey}-counter`}
                className={cn("min-w-0 truncate px-2 text-xs tabular-nums text-muted-foreground", tooLong && "text-destructive")}
              >
                {input.length > COUNTER_FROM &&
                  (tooLong
                    ? `Too long — ${DOC_CHAT_MAX_INPUT_CHARS.toLocaleString("en-US")} characters max. Paste it in parts.`
                    : `${input.length.toLocaleString("en-US")} / ${DOC_CHAT_MAX_INPUT_CHARS.toLocaleString("en-US")}`)}
              </p>
              {isLoading ? (
                <Button type="button" size="icon-sm" variant="secondary" onClick={handleStop} aria-label="Stop generating" title="Stop (Esc)">
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button type="submit" size="icon-sm" disabled={!input.trim() || tooLong} aria-label="Send" title="Send (Enter)">
                  <Send />
                </Button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground md:mt-2">{disclaimer}</p>
        </div>
      </form>
      {confirmDialog}
    </Card>
  );
}
