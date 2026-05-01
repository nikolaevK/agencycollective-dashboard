"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Send,
  Square,
  Sparkles,
  ChevronDown,
  TrendingUp,
  BarChart3,
  Lightbulb,
  Search,
  FileText,
  Wallet,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { parseSSEStream } from "@/lib/chatStreamParser";
import type {
  ChatMessage as ChatMessageType,
  ApiContentBlock,
  ReportResult,
} from "@/types/chat";

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "last_7d",    label: "Last 7 days" },
  { id: "last_14d",   label: "Last 14 days" },
  { id: "last_30d",   label: "Last 30 days" },
  { id: "last_90d",   label: "Last 90 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
];

type DatePreset = "last_7d" | "last_14d" | "last_30d" | "last_90d" | "this_month" | "last_month";

interface AccountOption {
  accountId: string;
  label: string | null;
}

interface AnalystInterfaceProps {
  slug: string;
  accounts: AccountOption[];
  initialAccountId: string;
}

interface SuggestionChip {
  icon: typeof TrendingUp;
  title: string;
  prompt: string;
}

const PRESET_QUESTIONS: SuggestionChip[] = [
  {
    icon: Sparkles,
    title: "Summarize last 7 days",
    prompt: "Summarize the last 7 days of performance for this account. Include key metrics, top campaigns, and what changed vs. the prior period.",
  },
  {
    icon: TrendingUp,
    title: "Top campaigns by ROAS",
    prompt: "Which campaigns have the best ROAS this period? Show me the top performers and what they have in common.",
  },
  {
    icon: AlertTriangle,
    title: "Where is budget being wasted",
    prompt: "Identify campaigns or ad sets with high spend but low conversions. Where is budget being wasted?",
  },
  {
    icon: BarChart3,
    title: "Compare to previous period",
    prompt: "Compare this period to the previous one. What improved, what got worse, and what should I do about it?",
  },
  {
    icon: Search,
    title: "Audit creative fatigue",
    prompt: "Audit my account for creative fatigue. Look at frequency, CTR trends, and ad set performance over time.",
  },
  {
    icon: Layers,
    title: "Demographic breakdown",
    prompt: "Break down performance by demographic. Where are my best audiences and where am I overspending?",
  },
  {
    icon: Lightbulb,
    title: "Analyze a landing page",
    prompt: "Analyze the following landing page for ad-to-page alignment and conversion optimization: ",
  },
  {
    icon: FileText,
    title: "Generate a PDF report",
    prompt: "Generate a comprehensive performance report I can download as a PDF. Include overview, campaigns, demographics, conversions, audit score, and recommendations.",
  },
];

function messagesToApi(
  msgs: ChatMessageType[],
): Array<{ role: "user" | "assistant"; content: string | ApiContentBlock[] }> {
  const out: Array<{ role: "user" | "assistant"; content: string | ApiContentBlock[] }> = [];
  for (const msg of msgs) {
    if (msg.role === "user") {
      out.push({ role: "user", content: msg.content });
      continue;
    }
    if (!msg.blocks || msg.blocks.length === 0) {
      if (msg.content) out.push({ role: "assistant", content: msg.content });
      continue;
    }
    const assistantBlocks: ApiContentBlock[] = [];
    const toolResultBlocks: ApiContentBlock[] = [];
    const continuationBlocks: ApiContentBlock[] = [];
    let seenToolResult = false;
    for (const b of msg.blocks) {
      if (b.type === "text" && b.text) {
        if (seenToolResult) continuationBlocks.push({ type: "text", text: b.text });
        else assistantBlocks.push({ type: "text", text: b.text });
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
    if (assistantBlocks.length > 0) out.push({ role: "assistant", content: assistantBlocks });
    if (toolResultBlocks.length > 0) out.push({ role: "user", content: toolResultBlocks });
    if (continuationBlocks.length > 0) out.push({ role: "assistant", content: continuationBlocks });
  }
  return out;
}

export function AnalystInterface({ slug, accounts, initialAccountId }: AnalystInterfaceProps) {
  const router = useRouter();
  const [accountId, setAccountId] = useState<string>(initialAccountId);
  const [datePreset, setDatePreset] = useState<DatePreset>("last_7d");
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const dateMenuRef = useRef<HTMLDivElement>(null);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.accountId === accountId) ?? accounts[0],
    [accounts, accountId],
  );

  const dateLabel = useMemo(
    () => DATE_PRESETS.find((p) => p.id === datePreset)?.label ?? "Last 7 days",
    [datePreset],
  );

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Click-outside for both menus
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false);
      }
      if (dateMenuRef.current && !dateMenuRef.current.contains(e.target as Node)) {
        setShowDateMenu(false);
      }
    }
    if (showAccountMenu || showDateMenu) {
      document.addEventListener("pointerdown", onPointerDown);
    }
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showAccountMenu, showDateMenu]);

  function handleAccountSwitch(nextId: string) {
    if (nextId === accountId) {
      setShowAccountMenu(false);
      return;
    }
    if (messages.length > 0) {
      const ok = confirm(
        "Switch to a different ad account? This will start a new conversation — the current chat will be cleared.",
      );
      if (!ok) {
        setShowAccountMenu(false);
        return;
      }
    }
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
    setAccountId(nextId);
    setShowAccountMenu(false);
    router.replace(`/${slug}/portal/analyst?accountId=${encodeURIComponent(nextId)}`);
  }

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
        const res = await fetch("/api/portal/analyst", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            accountId,
            dateRange: { preset: datePreset },
          }),
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
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + event.text, blocks },
              ];
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
              blocks.push({ type: "text", text: `\n\n*${event.message}*` });
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + `\n\n*${event.message}*`, blocks },
              ];
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
          blocks.push({ type: "text", text: `*${errorText}*` });
          return [...prev.slice(0, -1), { ...last, content: `*${errorText}*`, blocks }];
        });
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [messages, isLoading, accountId, datePreset],
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

  function handlePresetClick(prompt: string) {
    setInput(prompt);
    textareaRef.current?.focus();
  }

  const isStreamingLast =
    isLoading && messages.length > 0 && messages[messages.length - 1].role === "assistant";
  const lastMsg = messages[messages.length - 1];
  const isThinking =
    isLoading &&
    lastMsg?.role === "assistant" &&
    !lastMsg.content &&
    (!lastMsg.blocks || lastMsg.blocks.length === 0);

  const accountDisplay = selectedAccount.label ?? selectedAccount.accountId;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">AI Analyst</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask anything about your Meta ad account performance.
        </p>
      </div>

      {/* Disclaimer banner */}
      {!bannerDismissed && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm leading-relaxed">
            <p className="font-semibold">AI-generated analysis. Verify before acting.</p>
            <p className="mt-1 opacity-90">
              Numbers, recommendations, and reports may be inaccurate, incomplete, or out of date.
              Always cross-reference against your live Meta Ads Manager before making decisions or
              sharing reports externally. Reports should be reviewed by a human.
            </p>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-xs font-semibold uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar: account + date pickers */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Account picker */}
        <div ref={accountMenuRef} className="relative">
          <button
            onClick={() => setShowAccountMenu((v) => !v)}
            disabled={accounts.length === 0}
            className={cn(
              "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors",
              "border-border hover:border-primary/40",
              showAccountMenu && "border-primary/40 ring-1 ring-primary/20",
            )}
          >
            <Wallet className="h-3.5 w-3.5 text-primary" />
            <span className="max-w-[200px] truncate">{accountDisplay}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAccountMenu && "rotate-180")} />
          </button>

          {showAccountMenu && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-border bg-popover shadow-lg max-h-80 overflow-y-auto">
              <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Ad Account
              </p>
              {accounts.map((a) => {
                const isActive = a.accountId === accountId;
                return (
                  <button
                    key={a.accountId}
                    onClick={() => handleAccountSwitch(a.accountId)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted",
                      isActive && "bg-primary/5",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-medium truncate",
                          isActive ? "text-primary" : "text-foreground",
                        )}
                      >
                        {a.label ?? a.accountId}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">{a.accountId}</p>
                    </div>
                    {isActive && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary mt-2" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Date picker */}
        <div ref={dateMenuRef} className="relative">
          <button
            onClick={() => setShowDateMenu((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors",
              "border-border hover:border-primary/40",
              showDateMenu && "border-primary/40 ring-1 ring-primary/20",
            )}
          >
            <span>{dateLabel}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDateMenu && "rotate-180")} />
          </button>

          {showDateMenu && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-border bg-popover shadow-lg">
              {DATE_PRESETS.map((p) => {
                const isActive = p.id === datePreset;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setDatePreset(p.id);
                      setShowDateMenu(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                      isActive && "bg-primary/5 text-primary font-medium",
                    )}
                  >
                    {p.label}
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="rounded-2xl border border-border bg-card flex flex-col min-h-[60vh]">
        {/* Messages or empty state */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-8 gap-6">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground shadow-lg">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-xl font-bold tracking-tight">
                  Ask about {accountDisplay}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Analyzing performance for {dateLabel.toLowerCase()}
                </p>
              </div>

              <div className="grid w-full max-w-2xl grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_QUESTIONS.map((q) => {
                  const Icon = q.icon;
                  return (
                    <button
                      key={q.title}
                      onClick={() => handlePresetClick(q.prompt)}
                      className="flex items-center gap-2.5 p-3 bg-muted/40 border border-border/50 rounded-lg text-left hover:border-primary/40 hover:bg-primary/5 transition-all group"
                    >
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <p className="text-xs font-medium text-foreground group-hover:text-primary truncate">
                        {q.title}
                      </p>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-muted-foreground max-w-sm">
                Tap a question to start, or write your own below.
              </p>
            </div>
          ) : (
            messages.map((msg, i) => {
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

        {/* Input bar */}
        <div className="border-t border-border p-3 md:p-4">
          <div className="relative flex items-center rounded-xl border border-border/60 bg-background/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={`Ask about ${accountDisplay}…`}
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none bg-transparent px-4 py-3 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              style={{ maxHeight: "160px" }}
            />
            {isLoading ? (
              <button
                onClick={handleStop}
                className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                title="Stop generating"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className={cn(
                  "absolute right-2 flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                  input.trim()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
                title="Send (Enter)"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            AI-generated. Verify metrics in Meta Ads Manager before acting on recommendations.
          </p>
        </div>
      </div>
    </div>
  );
}
