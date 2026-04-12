"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Send,
  Square,
  Sparkles,
  ChevronDown,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  BarChart3,
  Paperclip,
  Bot,
  Settings,
  History,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { ChatMessage } from "./ChatMessage";
import { ContextSelector } from "./ContextSelector";
import { CHAT_MODELS, type ChatModelId } from "@/lib/chatModels";
import { parseSSEStream } from "@/lib/chatStreamParser";
import type { AccountSummary } from "@/types/dashboard";
import type {
  ChatMessage as ChatMessageType,
  ApiContentBlock,
  ReportResult,
} from "@/types/chat";

// ─── Suggestion cards ────────────────────────────────────────────────────────

interface SuggestionCard {
  icon: typeof TrendingUp;
  title: string;
  description: string;
  prompt: string;
}

const DEFAULT_SUGGESTIONS: SuggestionCard[] = [
  {
    icon: Sparkles,
    title: "Full portfolio analysis",
    description: "Audit all active accounts with benchmarks and recommendations.",
    prompt: "Run a full analysis across all my active accounts. Include performance audit with benchmark scoring, Andromeda strategy assessment, campaign structure evaluation with recommended structure, and prioritized action items. Use display tools for all data.",
  },
  {
    icon: TrendingUp,
    title: "Which accounts have the best ROAS?",
    description: "Full analysis across all connected accounts.",
    prompt: "Which accounts have the best ROAS this period?",
  },
  {
    icon: AlertTriangle,
    title: "Identify high spend, low conversion",
    description: "Audit leaky buckets in your funnel instantly.",
    prompt: "Identify campaigns with high spend but low conversions",
  },
  {
    icon: BarChart3,
    title: "Compare weekly performance",
    description: "Delta report of this week vs last week.",
    prompt: "What's the overall performance trend across all accounts?",
  },
];

function getAccountSuggestions(accounts: AccountSummary[]): SuggestionCard[] {
  if (accounts.length === 1) {
    const name = accounts[0].name;
    return [
      { icon: Sparkles, title: `Full analysis of ${name}`, description: "Complete audit with benchmarks and strategy.", prompt: `Run a full analysis of ${name}. Include performance audit with benchmark scoring, creative fatigue check, Andromeda strategy assessment, campaign structure evaluation with recommended structure, audience and placement breakdown, and prioritized action items. Use display tools for all data.` },
      { icon: TrendingUp, title: `What's driving ${name}'s performance?`, description: "Deep dive into performance drivers.", prompt: `What's driving ${name}'s performance this period?` },
      { icon: BarChart3, title: `Scale or pause campaigns`, description: `Optimize ${name}'s campaign mix.`, prompt: `Which campaigns in ${name} should I scale or pause?` },
      { icon: AlertTriangle, title: `Conversion funnel audit`, description: "Where users are dropping off.", prompt: `Show ${name}'s full conversion funnel — where are users dropping off?` },
    ];
  }
  if (accounts.length <= 3) {
    const names = accounts.map((a) => a.name).join(", ");
    return [
      { icon: Sparkles, title: "Full analysis of selected", description: "Complete audit with benchmarks and strategy.", prompt: `Run a full analysis of ${names}. Include performance audit with benchmark scoring, Andromeda strategy assessment, campaign structure evaluation, and prioritized action items for each account. Use display tools for all data.` },
      { icon: TrendingUp, title: "Compare ROAS across accounts", description: "Side-by-side performance analysis.", prompt: `Compare ROAS across ${names}` },
      { icon: Lightbulb, title: "Budget allocation advice", description: "Where to shift spend for best results.", prompt: "Where should I shift budget between selected accounts?" },
      { icon: AlertTriangle, title: "Top performer analysis", description: "Best campaign across all accounts.", prompt: "Show the top-performing campaign across all selected accounts" },
    ];
  }
  return [
    { icon: Sparkles, title: "Full analysis of selected", description: "Complete audit with benchmarks and strategy.", prompt: `Run a full analysis of all ${accounts.length} selected accounts. Include performance audit with benchmark scoring, Andromeda strategy assessment, campaign structure evaluation, and prioritized action items. Use display tools for all data.` },
    { icon: TrendingUp, title: "Rank accounts by efficiency", description: "Efficiency leaderboard.", prompt: "Rank my selected accounts by efficiency" },
    { icon: BarChart3, title: "Best demographics", description: "Top performing segments.", prompt: "Where are my best demographics across selected accounts?" },
    { icon: AlertTriangle, title: "Pause recommendations", description: "Campaigns to consider pausing.", prompt: "Which campaigns should I pause across selected accounts?" },
  ];
}

// ─── Model picker ────────────────────────────────────────────────────────────

function ModelPicker({
  model,
  onChange,
  disabled,
}: {
  model: ChatModelId;
  onChange: (id: ChatModelId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = CHAT_MODELS.find((m) => m.id === model)!;

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
          open
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground",
          disabled && "cursor-not-allowed opacity-40"
        )}
      >
        <current.icon className="h-3 w-3" />
        {current.label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-border bg-popover shadow-lg">
          <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Model
          </p>
          {CHAT_MODELS.map((m) => {
            const Icon = m.icon;
            const isActive = m.id === model;
            return (
              <button
                key={m.id}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors last:rounded-b-xl hover:bg-muted",
                  isActive && "bg-primary/5"
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-xs font-medium", isActive ? "text-primary" : "text-foreground")}>
                    {m.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{m.description}</p>
                </div>
                {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({
  onPrompt,
  selectedAccounts,
}: {
  onPrompt: (text: string) => void;
  selectedAccounts: AccountSummary[];
}) {
  const hasSelection = selectedAccounts.length > 0;
  const suggestions = hasSelection ? getAccountSuggestions(selectedAccounts) : DEFAULT_SUGGESTIONS;

  const subtitle = hasSelection
    ? selectedAccounts.length === 1
      ? `Focused on ${selectedAccounts[0].name}`
      : `Focused on ${selectedAccounts.length} selected accounts`
    : "I can analyze performance, identify scaling opportunities, and audit your account in seconds.";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 md:px-8 text-center">
      {/* Icon */}
      <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl md:rounded-3xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground shadow-2xl">
        <Sparkles className="h-8 w-8 md:h-10 md:w-10" />
      </div>

      {/* Title */}
      <div>
        <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Meta Ads Analyst
        </h3>
        <p className={cn(
          "mt-2 text-sm max-w-md",
          hasSelection ? "font-medium text-primary" : "text-muted-foreground"
        )}>
          {subtitle}
        </p>
      </div>

      {/* Suggestion pills — horizontal scroll on mobile */}
      <div className="w-full max-w-2xl flex gap-3 overflow-x-auto pb-2 md:hidden" style={{ scrollbarWidth: "none" }}>
        {suggestions.map((card) => (
          <button
            key={card.prompt}
            onClick={() => onPrompt(card.prompt)}
            className="whitespace-nowrap shrink-0 px-4 py-2.5 bg-card border border-border/50 rounded-full text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 transition-all active:scale-95"
          >
            {card.title}
          </button>
        ))}
      </div>

      {/* Suggestion cards — 2x2 grid on desktop */}
      <div className="hidden md:grid w-full max-w-2xl grid-cols-2 gap-3">
        {suggestions.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.prompt}
              onClick={() => onPrompt(card.prompt)}
              className="p-6 bg-card border border-border/50 rounded-2xl text-left hover:border-primary/40 hover:bg-primary/5 transition-all group"
            >
              <Icon className="h-5 w-5 text-primary mb-3" />
              <p className="text-sm font-semibold text-foreground group-hover:text-primary">
                {card.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mobile context banner ───────────────────────────────────────────────────

function MobileContextBanner({
  accountCount,
  selectedCount,
}: {
  accountCount: number;
  selectedCount: number;
}) {
  return (
    <div className="md:hidden mx-6 mb-6 p-4 rounded-xl bg-card shadow-[0_4px_24px_rgba(32,48,68,0.04)] border border-border/30 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {selectedCount > 0 ? `${selectedCount} Selected` : "All Accounts"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {accountCount} Connected Account{accountCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <button className="text-primary text-xs font-bold px-3 py-1.5 rounded-full hover:bg-primary/5 transition-all">
        CHANGE
      </button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a ChatMessageType to API-friendly message(s).
 *
 * Anthropic API requires tool_result blocks in a separate user message
 * immediately after the assistant message containing tool_use blocks.
 * So an assistant message with [text, tool_use, tool_result, text] becomes:
 *   1. { role: "assistant", content: [text, tool_use] }
 *   2. { role: "user", content: [tool_result] }
 * Any text after tool results is dropped from history (it was streamed to UI already).
 */
function messagesToApi(msgs: ChatMessageType[]): Array<{ role: "user" | "assistant"; content: string | ApiContentBlock[] }> {
  const result: Array<{ role: "user" | "assistant"; content: string | ApiContentBlock[] }> = [];

  for (const msg of msgs) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
      continue;
    }

    // Assistant message
    if (!msg.blocks || msg.blocks.length === 0) {
      if (msg.content) {
        result.push({ role: "assistant", content: msg.content });
      }
      continue;
    }

    // Split blocks into the Anthropic-required structure:
    //   assistant: [text, tool_use, ...]
    //   user:      [tool_result, ...]
    //   assistant: [text (continuation after tool results)]
    const assistantBlocks: ApiContentBlock[] = [];
    const toolResultBlocks: ApiContentBlock[] = [];
    const continuationBlocks: ApiContentBlock[] = [];
    let seenToolResult = false;

    for (const b of msg.blocks) {
      if (b.type === "text" && b.text) {
        if (seenToolResult) {
          continuationBlocks.push({ type: "text", text: b.text });
        } else {
          assistantBlocks.push({ type: "text", text: b.text });
        }
      } else if (b.type === "tool_use") {
        assistantBlocks.push({
          type: "tool_use",
          id: b.id,
          name: b.name,
          input: b.input as unknown as Record<string, unknown>,
        });
      } else if (b.type === "tool_result") {
        seenToolResult = true;
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: b.tool_use_id,
          content: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
        });
      }
    }

    if (assistantBlocks.length > 0) {
      result.push({ role: "assistant", content: assistantBlocks });
    }
    if (toolResultBlocks.length > 0) {
      result.push({ role: "user", content: toolResultBlocks });
    }
    if (continuationBlocks.length > 0) {
      result.push({ role: "assistant", content: continuationBlocks });
    }
  }

  return result;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ChatInterface() {
  const { dateRange } = useDateRange();
  const { data: allAccounts } = useAccounts(dateRange);
  const [model, setModel] = useState<ChatModelId>("claude-sonnet-4-6");
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);

  const selectedAccounts = useMemo(
    () => (allAccounts ?? []).filter((a) => selectedAccountIds.includes(a.id)),
    [allAccounts, selectedAccountIds]
  );

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessageType = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      };
      const assistantMessage: ChatMessageType = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        blocks: [],
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setIsLoading(true);

      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const apiMessages = messagesToApi([...messages, userMessage]);

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, selectedAccountIds, selectedCampaignIds, dateRange, model }),
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
              blocks.push({
                type: "tool_use",
                id: event.id,
                name: event.name,
                input: event.input,
              });
              return [...prev.slice(0, -1), { ...last, blocks }];
            });
          } else if (event.type === "tool_result") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const blocks = [...(last.blocks ?? [])];
              blocks.push({
                type: "tool_result",
                tool_use_id: event.tool_use_id,
                content: event.result as string | ReportResult,
              });
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
          // "done" — no action needed
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
        abortRef.current = null;
      }
    },
    [messages, isLoading, selectedAccountIds, selectedCampaignIds, dateRange, model]
  );

  function handleStop() {
    abortRef.current?.abort();
    setIsLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  const isStreamingLast = isLoading && messages.length > 0 && messages[messages.length - 1].role === "assistant";
  const lastMsg = messages[messages.length - 1];
  const isThinking = isLoading && lastMsg?.role === "assistant" && !lastMsg.content && (!lastMsg.blocks || lastMsg.blocks.length === 0);

  return (
    <div className="flex h-full w-full">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-80 shrink-0 border-r border-border overflow-hidden flex-col">
        <ContextSelector
          dateRange={dateRange}
          selectedAccountIds={selectedAccountIds}
          selectedCampaignIds={selectedCampaignIds}
          onAccountToggle={(id) => setSelectedAccountIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])}
          onCampaignToggle={(id) => setSelectedCampaignIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])}
          onSelectAll={() => { setSelectedAccountIds((allAccounts ?? []).map((a) => a.id)); setSelectedCampaignIds([]); }}
          onClearAll={() => { setSelectedAccountIds([]); setSelectedCampaignIds([]); }}
        />
      </aside>

      {/* Main chat panel */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header */}
        <div className="flex md:hidden items-center justify-between px-6 py-4 bg-background">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-semibold text-primary">AI Analyst</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                Active Insight Engine
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Chat history">
              <History className="h-4 w-4 text-muted-foreground" />
            </button>
            <button className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Settings">
              <Settings className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Desktop toolbar */}
        <div className="hidden md:flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">AI Insights Console</span>
          </div>
          <ModelPicker model={model} onChange={setModel} disabled={isLoading} />
        </div>

        {/* Mobile context banner */}
        {allAccounts && (
          <MobileContextBanner
            accountCount={allAccounts.length}
            selectedCount={selectedAccountIds.length}
          />
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6 space-y-6 pb-44 md:pb-6">
          {messages.length === 0 ? (
            <EmptyState onPrompt={sendMessage} selectedAccounts={selectedAccounts} />
          ) : (
            messages.map((msg, i) => {
              // Don't render the empty assistant placeholder while thinking
              if (isThinking && i === messages.length - 1) return null;
              return (
                <ChatMessage
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  blocks={msg.blocks}
                  isStreaming={isStreamingLast && i === messages.length - 1}
                />
              );
            })
          )}
          {isThinking && (
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5 pt-2">
                <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area — fixed on mobile, static on desktop */}
        <div className="fixed bottom-[88px] left-0 right-0 bg-background/90 backdrop-blur-md px-6 py-4 md:relative md:bottom-auto md:bg-transparent md:backdrop-blur-none md:border-t md:border-border md:px-8 md:py-4 z-30">
          <div className="max-w-3xl mx-auto">
            <div className={cn(
              "relative flex items-center focus-within:ring-2 focus-within:ring-primary/20 transition-all",
              "rounded-full bg-muted/50 md:rounded-2xl md:border md:border-border/50 md:bg-card md:px-3 md:py-2 md:shadow-xl md:shadow-primary/5"
            )}>
              {/* Paperclip — absolute on mobile, flow on desktop */}
              <button className="absolute left-4 md:relative md:left-auto p-2 text-muted-foreground hover:text-primary transition-colors shrink-0" aria-label="Attach file">
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask AI Analyst anything..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none bg-transparent py-3.5 pl-10 pr-12 md:py-1.5 md:pl-0 md:pr-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                style={{ maxHeight: "160px" }}
              />

              {/* Send / Stop button — absolute on mobile, flow on desktop */}
              {isLoading ? (
                <button
                  onClick={handleStop}
                  className="absolute right-2 md:relative md:right-auto flex h-9 w-9 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full md:rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  title="Stop generating"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim()}
                  className={cn(
                    "absolute right-2 md:relative md:right-auto flex h-9 w-9 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full md:rounded-xl transition-colors",
                    input.trim()
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                  title="Send (Enter)"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              AI can make mistakes. Please verify metrics in Meta Ads Manager.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
