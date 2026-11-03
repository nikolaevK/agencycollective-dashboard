"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Send,
  Square,
  Sparkles,
  TrendingUp,
  BarChart3,
  Lightbulb,
  Search,
  FileText,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/use-confirm";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { parseSSEStream } from "@/lib/chatStreamParser";
import { repairToolPairs, trimHistory } from "@/lib/analyst/history";
import type {
  ChatMessage as ChatMessageType,
  ApiContentBlock,
  ReportResult,
} from "@/types/chat";

// Lazy: the Radix menu code stays out of the page's first load (the pickers
// still server-render; client navigations show a same-height placeholder).
const AnalystPickers = dynamic(() => import("./AnalystPickers").then((m) => m.AnalystPickers), {
  loading: () => <div aria-hidden className="h-9 w-64 max-w-full rounded-4xl bg-muted/60" />,
});

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
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Set when a pick opens the switch confirm: the closing menu then must not
  // pull focus back to its trigger, away from the dialog.
  const confirmingSwitchRef = useRef(false);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.accountId === accountId) ?? accounts[0],
    [accounts, accountId],
  );

  const dateLabel = useMemo(
    () => DATE_PRESETS.find((p) => p.id === datePreset)?.label ?? "Last 7 days",
    [datePreset],
  );

  // Auto-scroll — only while the user is already near the bottom of the
  // message list. During streaming this fires on every token; unconditional
  // scrolling yanked the page down and made re-reading mid-response impossible.
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    pinnedToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);
  useEffect(() => {
    if (pinnedToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages]);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleAccountSwitch(nextId: string) {
    if (nextId === accountId) return;
    if (messages.length > 0) {
      const ok = await confirm({
        title: "Switch to a different ad account?",
        description: "This will start a new conversation — the current chat will be cleared.",
        confirmText: "Switch account",
      });
      if (!ok) return;
    }
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
    setAccountId(nextId);
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
        // Repair + trim: a stopped reply or failed tool leaves an unanswered
        // tool_use, which otherwise 400s every later message in this chat.
        const apiMessages = repairToolPairs(trimHistory(repairToolPairs(messagesToApi([...messages, userMessage]))));
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
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">AI Analyst</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask anything about your Meta ad account performance.
        </p>
      </div>

      {/* Disclaimer banner */}
      {!bannerDismissed && (
        <div
          role="alert"
          className={cn("flex items-start gap-3 rounded-3xl border p-4", badgeTone.warning)}
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 text-sm leading-relaxed">
            <p className="font-medium">AI-generated analysis. Verify before acting.</p>
            <p className="mt-1 opacity-90">
              Numbers, recommendations, and reports may be inaccurate, incomplete, or out of date.
              Always cross-reference against your live Meta Ads Manager before making decisions or
              sharing reports externally. Reports should be reviewed by a human.
            </p>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setBannerDismissed(true)}
            className="-my-0.5 shrink-0 text-current hover:bg-amber-500/15 hover:text-current dark:hover:bg-amber-400/15"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Toolbar: account + date pickers */}
      <div className="flex flex-wrap items-center gap-2">
        <AnalystPickers
          accounts={accounts}
          accountId={accountId}
          accountDisplay={accountDisplay}
          onAccountChange={(nextId) => {
            confirmingSwitchRef.current = nextId !== accountId && messages.length > 0;
            void handleAccountSwitch(nextId);
          }}
          onAccountMenuCloseAutoFocus={(e) => {
            if (confirmingSwitchRef.current) {
              confirmingSwitchRef.current = false;
              e.preventDefault();
            }
          }}
          dateLabel={dateLabel}
          datePreset={datePreset}
          datePresets={DATE_PRESETS}
          onDatePresetChange={(p) => setDatePreset(p as DatePreset)}
        />
      </div>

      {/* Chat area — height-bounded on phones so the message list scrolls
          internally and the composer stays visible instead of stranded at the
          bottom of an ever-growing page. */}
      <Card className="flex flex-col min-h-[60vh] max-h-[calc(100dvh-13rem)] md:max-h-none">
        {/* Messages or empty state */}
        <div ref={listRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-8 gap-6">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Sparkles className="size-6 text-muted-foreground" />
              </div>
              <div className="min-w-0 max-w-full">
                <h3 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                  Ask about {accountDisplay}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Analyzing performance for {dateLabel.toLowerCase()}
                </p>
              </div>

              <div className="grid w-full max-w-2xl grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_QUESTIONS.map((q) => {
                  const Icon = q.icon;
                  return (
                    <button
                      key={q.title}
                      type="button"
                      onClick={() => handlePresetClick(q.prompt)}
                      className="flex min-w-0 items-center gap-2.5 rounded-2xl border bg-background p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 dark:bg-transparent dark:hover:bg-input/30"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <p className="truncate text-sm font-medium text-foreground">
                        {q.title}
                      </p>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground max-w-sm">
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
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="size-3.5 animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5 pt-3">
                <span className="size-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <span className="size-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                <span className="size-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t p-3 md:p-4">
          <div className="relative flex items-center rounded-3xl border border-transparent bg-input/50 transition-[color,box-shadow,border-color] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={`Ask about ${accountDisplay}…`}
              rows={1}
              className="flex-1 resize-none bg-transparent px-4 py-3 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              style={{ maxHeight: "160px" }}
            />
            {isLoading ? (
              <Button
                variant="destructive"
                size="icon"
                onClick={handleStop}
                className="absolute right-1.5"
                title="Stop generating"
                aria-label="Stop generating"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="absolute right-1.5"
                title="Send (Enter)"
                aria-label="Send"
              >
                <Send className="size-3.5" />
              </Button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            AI-generated. Verify metrics in Meta Ads Manager before acting on recommendations.
          </p>
        </div>
      </Card>

      {confirmDialog}
    </div>
  );
}
