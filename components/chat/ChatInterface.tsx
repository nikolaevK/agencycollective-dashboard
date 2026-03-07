"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Square, Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { ChatMessage } from "./ChatMessage";
import { ContextSelector } from "./ContextSelector";
import { CHAT_MODELS, type ChatModelId } from "@/lib/chatModels";
import type { AccountSummary } from "@/types/dashboard";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const DEFAULT_PROMPTS = [
  "Which accounts have the best ROAS this period?",
  "Identify campaigns with high spend but low conversions",
  "What's the overall performance trend across all accounts?",
  "Which campaigns should I pause or scale?",
];

function getAccountPrompts(accounts: AccountSummary[]): string[] {
  if (accounts.length === 1) {
    const name = accounts[0].name;
    return [
      `What's driving ${name}'s performance this period?`,
      `Which campaigns in ${name} should I scale or pause?`,
      `Analyze ${name}'s audience demographics and best placements`,
      `Show ${name}'s full conversion funnel — where are users dropping off?`,
    ];
  }
  if (accounts.length <= 3) {
    const names = accounts.map((a) => a.name).join(", ");
    return [
      `Compare ROAS across ${names}`,
      `Which of my selected accounts has the best cost per purchase?`,
      `Where should I shift budget between selected accounts?`,
      `Show the top-performing campaign across all selected accounts`,
    ];
  }
  return [
    "Rank my selected accounts by efficiency",
    "Which accounts are in the learning phase right now?",
    "Where are my best demographics across selected accounts?",
    "Which campaigns should I pause across selected accounts?",
  ];
}

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

function EmptyState({
  onPrompt,
  selectedAccounts,
}: {
  onPrompt: (text: string) => void;
  selectedAccounts: AccountSummary[];
}) {
  const hasSelection = selectedAccounts.length > 0;
  const prompts = hasSelection ? getAccountPrompts(selectedAccounts) : DEFAULT_PROMPTS;

  const subtitle = hasSelection
    ? selectedAccounts.length === 1
      ? `Focused on ${selectedAccounts[0].name}`
      : `Focused on ${selectedAccounts.length} selected accounts`
    : "Select accounts in the left panel to focus the analysis.";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">Meta Ads Analyst</h3>
        <p className={cn("mt-1 text-sm max-w-xs", hasSelection ? "font-medium text-primary" : "text-muted-foreground")}>
          {subtitle}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPrompt(prompt)}
            className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-left text-xs text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatInterface() {
  const { dateRange } = useDateRange();
  const { data: allAccounts } = useAccounts(dateRange);
  const [model, setModel] = useState<ChatModelId>("claude-sonnet-4-6");
  const [messages, setMessages] = useState<Message[]>([]);
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

      const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
      const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setIsLoading(true);

      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const apiMessages = [...messages, userMessage].map((m) => ({ role: m.role, content: m.content }));

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

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== "assistant") return prev;
            return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const errorText = err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          return [...prev.slice(0, -1), { ...last, content: `*Error: ${errorText}*` }];
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
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
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

  return (
    <div className="flex h-full w-full">
      {/* Left panel — context selector */}
      <aside className="w-64 shrink-0 border-r border-border overflow-hidden flex flex-col">
        <ContextSelector
          dateRange={dateRange}
          selectedAccountIds={selectedAccountIds}
          selectedCampaignIds={selectedCampaignIds}
          onAccountToggle={(id) => setSelectedAccountIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])}
          onCampaignToggle={(id) => setSelectedCampaignIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])}
          onSelectAll={() => { setSelectedAccountIds([]); setSelectedCampaignIds([]); }}
          onClearAll={() => { setSelectedAccountIds([]); setSelectedCampaignIds([]); }}
        />
      </aside>

      {/* Right panel — chat thread */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Slim toolbar */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">AI Analyst</span>
          </div>
          <ModelPicker model={model} onChange={setModel} disabled={isLoading} />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 ? (
            <EmptyState onPrompt={sendMessage} selectedAccounts={selectedAccounts} />
          ) : (
            messages.map((msg, i) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                isStreaming={isStreamingLast && i === messages.length - 1}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-border p-4">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/50 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your Meta Ads data… (⌘+Enter to send)"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              style={{ maxHeight: "160px" }}
            />
            {isLoading ? (
              <button
                onClick={handleStop}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                title="Stop generating"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                  input.trim()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
                title="Send (⌘+Enter)"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            AI responses may contain errors. Always verify recommendations with your actual data.
          </p>
        </div>
      </div>
    </div>
  );
}
