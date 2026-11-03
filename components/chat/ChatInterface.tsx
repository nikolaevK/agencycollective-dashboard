"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowDown,
  BarChart3,
  Download,
  Lightbulb,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquarePen,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirm } from "@/components/ui/use-confirm";
import { useToast } from "@/components/providers/ToastProvider";
import { CHAT_MODELS, DEFAULT_MODEL } from "@/lib/chatModels";
import { parseSSEStream } from "@/lib/chatStreamParser";
import { buildApiHistory } from "@/lib/analyst/history";
import { DEFAULT_ANALYSIS_DEPTH, type AnalysisDepth } from "@/lib/analyst/request";
import { dateRangeLabel } from "@/lib/analyst/reportPeriod";
import { conversationToMarkdown } from "@/lib/analyst/exportMarkdown";
import {
  finishStreamLocally,
  initialStreamState,
  reduceStreamEvent,
  type PendingTool,
  type StreamState,
} from "@/lib/analyst/streamReducer";
import type { AccountSummary } from "@/types/dashboard";
import type { ChatMessage as ChatMessageType } from "@/types/chat";
import { ChatMessage, preloadChatRenderers } from "./ChatMessage";
import { ContextSelector } from "./ContextSelector";

// Radix Dialog only loads when the picker is opened below the xl breakpoint.
const ContextSheet = dynamic(() => import("./ContextSheet"), { ssr: false });

// ─── Suggestions ─────────────────────────────────────────────────────────────

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
      { icon: BarChart3, title: "Scale or pause campaigns", description: `Optimize ${name}'s campaign mix.`, prompt: `Which campaigns in ${name} should I scale or pause?` },
      { icon: AlertTriangle, title: "Conversion funnel audit", description: "Where users are dropping off.", prompt: `Show ${name}'s full conversion funnel — where are users dropping off?` },
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

const DEPTH_OPTIONS: { value: AnalysisDepth; label: string; hint: string }[] = [
  { value: "quick", label: "Quick", hint: "Fastest replies for simple lookups" },
  { value: "balanced", label: "Balanced", hint: "Good depth, faster than Thorough" },
  { value: "thorough", label: "Thorough", hint: "Deepest analysis (default) — slower" },
];

function EmptyState({ onPrompt, selectedAccounts }: { onPrompt: (text: string) => void; selectedAccounts: AccountSummary[] }) {
  const hasSelection = selectedAccounts.length > 0;
  const suggestions = hasSelection ? getAccountSuggestions(selectedAccounts) : DEFAULT_SUGGESTIONS;
  const subtitle = hasSelection
    ? selectedAccounts.length === 1
      ? `Focused on ${selectedAccounts[0].name}.`
      : `Focused on ${selectedAccounts.length} selected accounts.`
    : "Analyze performance, find scaling opportunities and audit accounts — with charts, tables and client-ready reports.";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 py-6 text-center md:py-10">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Sparkles className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <h3 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">Ask about your Meta ads</h3>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.prompt}
              type="button"
              onClick={() => onPrompt(card.prompt)}
              className="flex min-w-0 items-start gap-3 rounded-3xl border bg-background p-3.5 text-left outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 dark:bg-transparent dark:hover:bg-input/30"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{card.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{card.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

const STREAM_FLUSH_MS = 50;
/** The route rejects a typed message over 8,000 characters. */
const MAX_INPUT_CHARS = 8_000;

/** `active` = this tool's Creative Studio tab is showing (panels stay mounted while hidden). */
export function ChatInterface({ active = true }: { active?: boolean } = {}) {
  const { dateRange } = useDateRange();
  const { data: allAccounts } = useAccounts(dateRange);
  const { toastError } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [live, setLive] = useState<{ pendingTools: PendingTool[]; status: string | null }>({ pendingTools: [], status: null });
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [depth, setDepth] = useState<AnalysisDepth>(DEFAULT_ANALYSIS_DEPTH);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<Record<string, string>>({}); // campaignId → accountId
  const [sheet, setSheet] = useState<{ mounted: boolean; open: boolean; side: "bottom" | "right" }>({
    mounted: false,
    open: false,
    side: "right",
  });
  const [elapsed, setElapsed] = useState(0);
  const [pinned, setPinned] = useState(true);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  const streamRef = useRef<StreamState | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pinnedRef = useRef(true);

  const selectedCampaignIds = useMemo(() => Object.keys(selectedCampaigns), [selectedCampaigns]);
  const campaignCountByAccount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const accountId of Object.values(selectedCampaigns)) counts[accountId] = (counts[accountId] ?? 0) + 1;
    return counts;
  }, [selectedCampaigns]);
  const selectedAccounts = useMemo(
    () => (allAccounts ?? []).filter((a) => selectedAccountIds.includes(a.id)),
    [allAccounts, selectedAccountIds]
  );
  const periodLabel = dateRangeLabel(dateRange);
  const modelLabel = (CHAT_MODELS.find((m) => m.id === DEFAULT_MODEL) ?? CHAT_MODELS[0]).label;

  const contextSummary =
    selectedAccountIds.length > 0
      ? `${selectedAccountIds.length === 1 ? selectedAccounts[0]?.name ?? "1 account" : `${selectedAccountIds.length} accounts`}${
          selectedCampaignIds.length > 0 ? ` · ${selectedCampaignIds.length} campaign${selectedCampaignIds.length === 1 ? "" : "s"}` : ""
        }`
      : "All active accounts";

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
    if (!active || !el) return;
    // The empty state (and a new chat) reads from its heading, not the bottom.
    if (messages.length === 0) el.scrollTop = 0;
    else if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, live, active]);

  const scrollToEnd = useCallback(() => {
    pinnedRef.current = true;
    setPinned(true);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  // ── Panel lifecycle ──
  useEffect(() => {
    if (!active) return;
    preloadChatRenderers();
    // Focus the composer when the tab opens — not on touch screens (it would pop the keyboard).
    if (window.matchMedia?.("(pointer: fine)").matches) textareaRef.current?.focus({ preventScroll: true });
  }, [active]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Elapsed-time counter for the working line — only while a reply streams and the tab is visible.
  useEffect(() => {
    if (!isLoading || !active) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLoading, active]);

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
    setLive({ pendingTools: state.pendingTools, status: state.status });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flush, STREAM_FLUSH_MS);
  }, [flush]);

  const sendMessage = useCallback(
    async (text: string, base?: ChatMessageType[]) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current) return; // ref guard: two quick Enters can't double-send
      busyRef.current = true;

      const history = base ?? messagesRef.current;
      const userMessage: ChatMessageType = { id: crypto.randomUUID(), role: "user", content: trimmed };
      const stream = initialStreamState(crypto.randomUUID());
      streamRef.current = stream;
      stoppedRef.current = false;
      startedAtRef.current = Date.now();
      setElapsed(0);
      pinnedRef.current = true;
      setPinned(true);
      setMessages([...history, userMessage, stream.message]);
      setLive({ pendingTools: [], status: null });
      setInput("");
      setIsLoading(true);
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const controller = new AbortController();
      abortRef.current = controller;
      const apply = (s: StreamState) => {
        streamRef.current = s;
        scheduleFlush();
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: buildApiHistory([...history, userMessage]),
            selectedAccountIds,
            selectedCampaignIds,
            dateRange,
            model: DEFAULT_MODEL,
            depth,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(typeof errBody.error === "string" ? errBody.error : `Request failed (HTTP ${res.status})`);
        }

        for await (const event of parseSSEStream(res.body)) {
          if (controller.signal.aborted) break;
          apply(reduceStreamEvent(streamRef.current!, event));
        }
        if (!controller.signal.aborted && !streamRef.current?.finished) {
          apply(finishStreamLocally(streamRef.current!, "error", "The connection was interrupted before the reply finished."));
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
        streamRef.current = null;
        if (abortRef.current === controller) abortRef.current = null;
        busyRef.current = false;
        setIsLoading(false);
      }
    },
    [selectedAccountIds, selectedCampaignIds, dateRange, depth, scheduleFlush, flush]
  );

  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.abort();
  }, []);

  /** Regenerate: drop the last reply and send its question again. */
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
      description: "This conversation will be cleared. Export it first if you want to keep it.",
      confirmText: "New chat",
    });
    if (!ok) return;
    abortRef.current?.abort();
    setMessages([]);
    setLive({ pendingTools: [], status: null });
    setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0);
  }, [confirm]);

  const handleExport = useCallback(() => {
    const msgs = messagesRef.current;
    if (msgs.length === 0) return;
    try {
      const md = conversationToMarkdown(msgs, {
        title: "AI Analyst conversation",
        subtitle: `${contextSummary} · ${periodLabel}`,
      });
      const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-analyst-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toastError("Couldn't export the conversation.");
    }
  }, [contextSummary, periodLabel, toastError]);

  // ── Context selection ──
  const toggleAccount = useCallback(
    (id: string) => {
      if (selectedAccountIds.includes(id)) {
        setSelectedAccountIds((prev) => prev.filter((x) => x !== id));
        // Its campaigns go too — they're only read for accounts in context.
        setSelectedCampaigns((prev) => Object.fromEntries(Object.entries(prev).filter(([, accountId]) => accountId !== id)));
      } else {
        setSelectedAccountIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      }
    },
    [selectedAccountIds]
  );

  const toggleCampaign = useCallback(
    (campaignId: string, accountId: string) => {
      if (selectedCampaigns[campaignId]) {
        setSelectedCampaigns((prev) => {
          const next = { ...prev };
          delete next[campaignId];
          return next;
        });
      } else {
        setSelectedCampaigns((prev) => ({ ...prev, [campaignId]: accountId }));
        setSelectedAccountIds((prev) => (prev.includes(accountId) ? prev : [...prev, accountId]));
      }
    },
    [selectedCampaigns]
  );

  const selectAccounts = useCallback((ids: string[]) => {
    setSelectedAccountIds((prev) => Array.from(new Set([...prev, ...ids])));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedAccountIds([]);
    setSelectedCampaigns({});
  }, []);

  const openContextSheet = useCallback(() => {
    const side = window.matchMedia?.("(max-width: 639px)").matches ? "bottom" : "right";
    setSheet({ mounted: true, open: true, side });
  }, []);

  const selectorProps = {
    dateRange,
    selectedAccountIds,
    selectedCampaignIds,
    onAccountToggle: toggleAccount,
    onCampaignToggle: toggleCampaign,
    onSelectAll: selectAccounts,
    onClearAll: clearSelection,
    campaignCountByAccount,
  };

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

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      {/* Docked context picker (wide screens) */}
      <Card className="hidden w-80 shrink-0 flex-col xl:flex">
        <ContextSelector {...selectorProps} className="min-h-0 flex-1" />
      </Card>

      {/* Chat */}
      <Card className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 md:px-4 md:py-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={openContextSheet}
            className="min-w-0 max-w-full justify-start gap-2 px-2 xl:hidden"
            aria-label={`Data context: ${contextSummary}, ${periodLabel}. Change`}
          >
            <SlidersHorizontal className="text-muted-foreground" />
            <span className="truncate">{contextSummary}</span>
            <span className="hidden shrink-0 text-muted-foreground sm:inline">· {periodLabel}</span>
          </Button>
          <p className="hidden min-w-0 truncate px-1 text-sm xl:block">
            <span className="font-medium">{contextSummary}</span>
            <span className="text-muted-foreground"> · {periodLabel}</span>
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Badge variant="outline" className="hidden text-muted-foreground sm:inline-flex" title="Claude model">
              {modelLabel}
            </Badge>
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
          <div
            ref={listRef}
            onScroll={handleListScroll}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5"
            aria-live="off"
          >
            {messages.length === 0 ? (
              <EmptyState onPrompt={(t) => void sendMessage(t)} selectedAccounts={selectedAccounts} />
            ) : (
              <div className="mx-auto w-full max-w-4xl space-y-6">
                {messages.map((msg, i) => {
                  const streaming = isLoading && i === lastIndex && msg.role === "assistant";
                  return (
                    <ChatMessage
                      key={msg.id}
                      role={msg.role}
                      content={msg.content}
                      blocks={msg.blocks}
                      servedBy={msg.servedBy}
                      isStreaming={streaming}
                      pendingTools={streaming ? live.pendingTools : undefined}
                      status={streaming ? live.status : undefined}
                      elapsedSeconds={streaming ? elapsed : undefined}
                      onRetry={!isLoading && i === lastAssistantIndex ? handleRetry : undefined}
                      onContinue={!isLoading && i === lastAssistantIndex ? handleContinue : undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {!pinned && messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={scrollToEnd}
              className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 shadow-md"
            >
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
            <div className="rounded-3xl border border-transparent bg-input/50 transition-[color,box-shadow,border-color] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onFocus={preloadChatRenderers}
                placeholder="Ask about performance, budgets, creatives, landing pages…"
                aria-label="Message the AI Analyst"
                maxLength={MAX_INPUT_CHARS}
                rows={1}
                className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={depth}
                  onValueChange={(v) => v && setDepth(v as AnalysisDepth)}
                  aria-label="Analysis depth"
                  className="gap-0.5"
                >
                  {DEPTH_OPTIONS.map((o) => (
                    <ToggleGroupItem key={o.value} value={o.value} title={o.hint} className="h-7 px-2.5 text-xs">
                      {o.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {isLoading ? (
                  <Button type="button" size="icon-sm" variant="secondary" onClick={handleStop} aria-label="Stop generating" title="Stop (Esc)">
                    <Square className="size-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon-sm" disabled={!input.trim()} aria-label="Send" title="Send (Enter)">
                    <Send />
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground md:mt-2">
              AI can make mistakes — verify metrics in Meta Ads Manager.
              <span className="hidden sm:inline"> Meta data refreshes once a day.</span>
            </p>
          </div>
        </form>
      </Card>

      {sheet.mounted && (
        <ContextSheet
          {...selectorProps}
          open={sheet.open}
          side={sheet.side}
          onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        />
      )}
      {confirmDialog}
    </div>
  );
}
