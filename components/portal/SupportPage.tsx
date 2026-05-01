"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format, isToday, parseISO } from "date-fns";
import { Send, Star, Smile, Meh, Frown, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ConversationRecord,
  MessageRecord,
  PresenceSnapshot,
  SenderInfo,
} from "@/lib/conversations";
import type {
  FeedbackRecord,
  FeedbackReplyRecord,
  Sentiment,
} from "@/lib/feedback";

interface FeedbackWithReplies extends FeedbackRecord {
  replies: FeedbackReplyRecord[];
}

interface SupportPayload {
  conversation: ConversationRecord;
  messages: MessageRecord[];
  senders: Record<string, SenderInfo>;
  presence: PresenceSnapshot;
  feedback: FeedbackWithReplies[];
}

async function fetchSupport(): Promise<SupportPayload> {
  const res = await fetch("/api/portal/support");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as SupportPayload;
}

async function fetchPollMessages(cursor: { createdAt: string; id: string }) {
  const params = new URLSearchParams({ since: cursor.createdAt, sinceId: cursor.id });
  const res = await fetch(`/api/portal/support/messages?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as { messages: MessageRecord[]; senders: Record<string, SenderInfo> };
}

async function fetchPresence(): Promise<PresenceSnapshot> {
  const res = await fetch("/api/portal/support/presence");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as PresenceSnapshot;
}

async function fetchFeedback(): Promise<FeedbackWithReplies[]> {
  const res = await fetch("/api/portal/support/feedback");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as FeedbackWithReplies[];
}

export function SupportPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["portal-support"],
    queryFn: fetchSupport,
    staleTime: 0,
  });

  return (
    <main className="flex-1 overflow-y-auto bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
            Feedback &amp; Support
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Share your thoughts on recent deliverables or chat directly with our team.
          </p>
        </header>

        {isLoading ? (
          <div className="flex h-[400px] items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error || !data ? (
          <div className="flex h-[400px] flex-col items-center justify-center text-muted-foreground gap-3">
            <p className="text-sm">Couldn&apos;t load support. {(error as Error)?.message ?? ""}</p>
            <button
              onClick={() => refetch()}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7">
              <SupportChat initial={data} />
            </div>
            <div className="lg:col-span-5">
              <FeedbackPanel initial={data.feedback} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Chat ───────────────────────────────────────────────────────────────

interface ChatProps {
  initial: SupportPayload;
}

function SupportChat({ initial }: ChatProps) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<MessageRecord[]>(initial.messages);
  const [senders, setSenders] = useState<Record<string, SenderInfo>>(initial.senders);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef(true);

  // Cursor lives in a ref so polling can advance it without changing the
  // stable useQuery key. Initialised to the latest message at first paint;
  // each poll that returns rows bumps it forward.
  const cursorStateRef = useRef<{ createdAt: string; id: string }>({
    createdAt: initial.messages.length > 0 ? initial.messages[initial.messages.length - 1].createdAt : "1970-01-01 00:00:00",
    id: initial.messages.length > 0 ? initial.messages[initial.messages.length - 1].id : "",
  });

  // Adaptive cadence: fast 20s while the conversation is recently active,
  // slow 60s when it's been idle for >2 min. React Query re-evaluates the
  // refetchInterval function after each tick, so reading from a ref is enough
  // to flip cadences without a re-render.
  const lastActivityRef = useRef(Date.now());

  // Poll for new messages — paused while tab hidden via
  // refetchIntervalInBackground=false. Returning to the tab triggers an
  // immediate refetch via refetchOnWindowFocus.
  const pollQuery = useQuery({
    queryKey: ["portal-support-poll"],
    queryFn: () => fetchPollMessages(cursorStateRef.current),
    refetchInterval: () =>
      Date.now() - lastActivityRef.current > 120_000 ? 60_000 : 20_000,
    staleTime: 0,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const data = pollQuery.data;
    if (!data || data.messages.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const additions = data.messages.filter((m) => !seen.has(m.id));
      if (additions.length === 0) return prev;
      pendingScrollRef.current = true;
      return [...prev, ...additions];
    });
    setSenders((prev) => ({ ...prev, ...data.senders }));
    const last = data.messages[data.messages.length - 1];
    cursorStateRef.current = { createdAt: last.createdAt, id: last.id };
    lastActivityRef.current = Date.now();
    void fetch("/api/portal/support/read", { method: "POST" });
    void queryClient.invalidateQueries({ queryKey: ["portal-support-unread"] });
  }, [pollQuery.data, queryClient]);

  // Presence polled separately at 60s — not critical, just a status dot.
  const { data: presence } = useQuery<PresenceSnapshot>({
    queryKey: ["portal-support-presence"],
    queryFn: fetchPresence,
    refetchInterval: 90_000,
    staleTime: 45_000,
    refetchIntervalInBackground: false,
    initialData: initial.presence,
  });

  useEffect(() => {
    // The initial GET /api/portal/support already marks read server-side; we
    // just nudge the sidebar badge query to refetch so it clears immediately.
    void queryClient.invalidateQueries({ queryKey: ["portal-support-unread"] });
  }, [queryClient]);

  useEffect(() => {
    if (!pendingScrollRef.current) return;
    pendingScrollRef.current = false;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch("/api/portal/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      return json.data as { message: MessageRecord; senders: Record<string, SenderInfo> };
    },
    onSuccess: (data) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        pendingScrollRef.current = true;
        return [...prev, data.message];
      });
      setSenders((prev) => ({ ...prev, ...data.senders }));
      // Advance cursor past our own message so the next poll skips it.
      cursorStateRef.current = { createdAt: data.message.createdAt, id: data.message.id };
      lastActivityRef.current = Date.now();
      setDraft("");
    },
  });

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  }

  return (
    <div className="bg-card rounded-xl shadow-[0_4px_24px_rgba(32,48,68,0.04)] dark:shadow-none border border-border/50 dark:border-white/[0.06] flex flex-col h-[640px] overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50 dark:border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground">Direct Support</h3>
            <p className="text-[11px] flex items-center gap-1.5">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  presence?.online ? "bg-emerald-500" : "bg-muted-foreground/40"
                )}
              />
              <span className={cn("font-semibold", presence?.online ? "text-primary" : "text-muted-foreground")}>
                {presence?.online ? "Team is online" : "Team is offline"}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3 bg-muted/20">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">Say hello — we&apos;re here to help.</p>
          </div>
        ) : (
          renderWithDateSeparators(messages, senders)
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-border/50 dark:border-white/[0.06] bg-card">
        <div className="flex items-end gap-2 bg-muted/40 rounded-xl p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e as unknown as React.FormEvent);
              }
            }}
            rows={1}
            placeholder="Type your message…"
            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm resize-none py-2 px-2 max-h-32 text-foreground placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sendMutation.isPending}
            className="bg-primary text-primary-foreground p-2.5 rounded-lg shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        {sendMutation.isError && (
          <p className="text-xs text-destructive mt-2">
            {(sendMutation.error as Error)?.message ?? "Failed to send. Try again."}
          </p>
        )}
      </form>
    </div>
  );
}

function renderWithDateSeparators(
  messages: MessageRecord[],
  senders: Record<string, SenderInfo>
) {
  const elements: React.ReactNode[] = [];
  let lastDateKey = "";
  for (const m of messages) {
    const dt = parseISO(m.createdAt.replace(" ", "T") + "Z");
    const dateKey = format(dt, "yyyy-MM-dd");
    if (dateKey !== lastDateKey) {
      lastDateKey = dateKey;
      elements.push(
        <div key={`sep-${dateKey}`} className="flex justify-center my-2">
          <span className="bg-muted px-3 py-0.5 rounded-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {isToday(dt) ? "Today" : format(dt, "MMM d, yyyy")}
          </span>
        </div>
      );
    }
    elements.push(<MessageRow key={m.id} message={m} sender={senders[m.senderId]} />);
  }
  return elements;
}

function MessageRow({ message, sender }: { message: MessageRecord; sender?: SenderInfo }) {
  const isClient = message.senderType === "client";
  const dt = parseISO(message.createdAt.replace(" ", "T") + "Z");

  if (message.deletedAt) {
    return (
      <div className={cn("flex", isClient ? "justify-end" : "justify-start")}>
        <span className="text-[11px] italic text-muted-foreground">Message deleted</span>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2 max-w-[85%]", isClient ? "ml-auto flex-row-reverse" : "")}>
      {!isClient && (
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-1">
          {sender?.displayName?.[0]?.toUpperCase() ?? "A"}
        </div>
      )}
      <div className={cn("flex flex-col", isClient ? "items-end" : "items-start")}>
        <div
          className={cn(
            "p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
            isClient
              ? "bg-primary text-primary-foreground rounded-tr-none"
              : "bg-card text-foreground rounded-tl-none border border-border/50 dark:border-white/[0.06]"
          )}
        >
          {message.body}
        </div>
        <span className="text-[10px] text-muted-foreground mt-1 px-1">
          {!isClient && sender?.displayName ? `${sender.displayName} · ` : ""}
          {format(dt, "h:mm a")}
          {message.editedAt ? " · edited" : ""}
        </span>
      </div>
    </div>
  );
}

// ── Feedback ───────────────────────────────────────────────────────────

interface FeedbackProps {
  initial: FeedbackWithReplies[];
}

const SENTIMENT_OPTIONS: { value: Sentiment; label: string; Icon: typeof Smile }[] = [
  { value: "happy", label: "Happy", Icon: Smile },
  { value: "neutral", label: "Neutral", Icon: Meh },
  { value: "concerned", label: "Concerned", Icon: Frown },
];

function FeedbackPanel({ initial }: FeedbackProps) {
  const queryClient = useQueryClient();
  const [sentiment, setSentiment] = useState<Sentiment>("happy");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");

  // Polled refresh — picks up admin replies on existing items.
  const { data: feedback = initial } = useQuery<FeedbackWithReplies[]>({
    queryKey: ["portal-feedback"],
    queryFn: fetchFeedback,
    refetchInterval: 90_000,
    staleTime: 45_000,
    refetchIntervalInBackground: false,
    initialData: initial,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/support/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentiment, rating, body: body.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      return json.data as FeedbackWithReplies;
    },
    onSuccess: () => {
      setSentiment("happy");
      setRating(5);
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["portal-feedback"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl p-6 shadow-[0_4px_24px_rgba(32,48,68,0.04)] dark:shadow-none border border-border/50 dark:border-white/[0.06]">
        <h3 className="text-lg font-bold text-foreground mb-1">Project Feedback</h3>
        <p className="text-sm text-muted-foreground mb-6">
          How are we doing? Your feedback goes straight to the team.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!submitMutation.isPending) submitMutation.mutate();
          }}
          className="space-y-5"
        >
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 block">
              Overall Sentiment
            </label>
            <div className="flex gap-2">
              {SENTIMENT_OPTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSentiment(value)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                    sentiment === value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className="h-7 w-7" />
                  <span className="text-[11px] font-bold">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 block">
              Service Quality
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className="p-1"
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                >
                  <Star
                    className={cn(
                      "h-7 w-7 transition-colors",
                      n <= rating ? "fill-primary text-primary" : "text-muted-foreground/30"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="feedback-body"
              className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2 block"
            >
              Detailed Message
            </label>
            <textarea
              id="feedback-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Tell us more about your experience…"
              className="w-full bg-muted/40 border border-border/50 rounded-xl text-sm p-3 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold text-sm shadow-sm hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {submitMutation.isPending ? "Submitting…" : "Submit Feedback"}
          </button>
          {submitMutation.isError && (
            <p className="text-xs text-destructive">
              {(submitMutation.error as Error)?.message ?? "Failed to submit. Try again."}
            </p>
          )}
        </form>
      </div>

      <FeedbackHistory items={feedback} />
    </div>
  );
}

function FeedbackHistory({ items }: { items: FeedbackWithReplies[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-muted/30 rounded-xl p-5 border border-dashed border-border/60 text-center">
        <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-1">
          History
        </p>
        <p className="text-sm text-muted-foreground">
          You haven&apos;t shared any feedback yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Your Feedback History
      </h4>
      {items.map((f) => (
        <FeedbackHistoryCard key={f.id} item={f} />
      ))}
    </div>
  );
}

function FeedbackHistoryCard({ item }: { item: FeedbackWithReplies }) {
  const dt = parseISO(item.createdAt.replace(" ", "T") + "Z");
  const sentimentColor =
    item.sentiment === "happy"
      ? "text-emerald-600 dark:text-emerald-400"
      : item.sentiment === "neutral"
        ? "text-muted-foreground"
        : "text-amber-600 dark:text-amber-400";

  return (
    <div className="bg-card rounded-xl p-4 border border-border/50 dark:border-white/[0.06]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-bold uppercase tracking-widest", sentimentColor)}>
            {item.sentiment}
          </span>
          <span className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={cn("h-3 w-3", n <= item.rating ? "fill-primary text-primary" : "text-muted-foreground/30")}
              />
            ))}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">{format(dt, "MMM d, yyyy")}</span>
      </div>
      {item.body && (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{item.body}</p>
      )}
      {item.replies.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
          {item.replies.map((r) => {
            const replyDt = parseISO(r.createdAt.replace(" ", "T") + "Z");
            return (
              <div key={r.id} className="bg-primary/5 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-primary">
                    {r.adminDisplayName ?? "Team"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(replyDt, "MMM d · h:mm a")}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{r.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
