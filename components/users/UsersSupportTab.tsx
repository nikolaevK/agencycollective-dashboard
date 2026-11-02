"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Send,
  MessageSquare,
  Loader2,
  Star,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, BadgeDot, badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirm } from "@/components/ui/use-confirm";
import type {
  ConversationRecord,
  InboxEntry,
  MessageRecord,
  SenderInfo,
} from "@/lib/conversations";
import type {
  AdminFeedbackEntry,
  FeedbackReplyRecord,
  FeedbackStatus,
} from "@/lib/feedback";

type SubTab = "conversations" | "feedback";

export function UsersSupportTab() {
  const [subTab, setSubTab] = useState<SubTab>("conversations");
  // Selection state is lifted so flipping between Conversations and Feedback
  // doesn't drop what the admin had open.
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);

  return (
    <Card>
      <div className="border-b px-4 py-3">
        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as SubTab)}>
          <TabsList>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {subTab === "conversations" ? (
        <ConversationsView
          selectedUserId={selectedUserId}
          onSelect={setSelectedUserId}
        />
      ) : (
        <FeedbackView
          selectedId={selectedFeedbackId}
          onSelect={setSelectedFeedbackId}
        />
      )}
    </Card>
  );
}

/** Placeholder rows while a list loads (avatar + two lines). */
function ListSkeleton({ avatar }: { avatar?: boolean }) {
  return (
    <div className="divide-y">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          {avatar && <Skeleton className="size-9 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Conversations ──────────────────────────────────────────────────────

function ConversationsView({
  selectedUserId,
  onSelect,
}: {
  selectedUserId: string | null;
  onSelect: (userId: string | null) => void;
}) {
  const { data: inbox = [], isLoading } = useQuery<InboxEntry[]>({
    queryKey: ["admin-support-inbox"],
    queryFn: async () => {
      const res = await fetch("/api/admin/support/conversations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data as InboxEntry[];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    refetchIntervalInBackground: false,
  });

  return (
    // Below md this is a two-screen flow: inbox OR thread, never both stacked
    // (the stacked layout gave no feedback on select and stranded the composer
    // mid-page under the keyboard).
    <div className="grid grid-cols-1 md:grid-cols-12 min-h-[600px]">
      <div
        className={cn(
          "md:col-span-4 lg:col-span-3 md:border-r max-h-[70dvh] md:max-h-[640px] overflow-y-auto",
          selectedUserId && "hidden md:block"
        )}
      >
        {isLoading ? (
          <ListSkeleton avatar />
        ) : inbox.length === 0 ? (
          <div className="p-6 text-center">
            <MessageSquare className="size-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Clients can reach out from their portal.
            </p>
          </div>
        ) : (
          inbox.map((entry) => (
            <InboxRow
              key={entry.conversationId}
              entry={entry}
              active={selectedUserId === entry.userId}
              onSelect={() => onSelect(entry.userId)}
            />
          ))
        )}
      </div>

      <div className={cn("md:col-span-8 lg:col-span-9", !selectedUserId && "hidden md:block")}>
        {selectedUserId ? (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSelect(null)}
              className="md:hidden h-10 w-full justify-start rounded-none border-b px-3 text-muted-foreground"
            >
              <ChevronLeft />
              All conversations
            </Button>
            {/* key forces a fresh mount on switch — without it, React reuses the
                ConversationThread instance and the cursor ref / messages state
                from the previous client briefly leak into the new view. */}
            <ConversationThread key={selectedUserId} userId={selectedUserId} />
          </>
        ) : (
          <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-muted-foreground gap-2">
            <MessageSquare className="size-6" />
            <p className="text-sm">Select a conversation to start replying.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function InboxRow({
  entry,
  active,
  onSelect,
}: {
  entry: InboxEntry;
  active: boolean;
  onSelect: () => void;
}) {
  const lastDt = entry.lastMessageAt
    ? parseISO(entry.lastMessageAt.replace(" ", "T") + "Z")
    : null;
  const initials =
    entry.userDisplayName
      ?.split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "??";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left flex items-start gap-3 px-4 py-3 border-b transition-colors",
        active ? "bg-muted" : "hover:bg-muted/50"
      )}
    >
      <div className="size-9 rounded-full bg-muted text-muted-foreground ring-1 ring-border flex items-center justify-center text-xs font-medium shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground truncate">
            {entry.userDisplayName ?? "Unknown client"}
          </p>
          {entry.unreadCount > 0 && (
            <Badge variant="destructive" className="h-4 min-w-[18px] px-1 tabular-nums">
              {entry.unreadCount > 99 ? "99+" : entry.unreadCount}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {entry.lastMessageSenderType === "admin" ? "You: " : ""}
          {entry.lastMessagePreview ?? "No messages yet"}
        </p>
        {lastDt && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {formatDistanceToNow(lastDt, { addSuffix: true })}
          </p>
        )}
      </div>
    </button>
  );
}

interface ThreadPayload {
  conversation: ConversationRecord | null;
  user: { id: string; displayName: string | null; slug: string | null };
  messages: MessageRecord[];
  senders: Record<string, SenderInfo>;
}

function ConversationThread({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [senders, setSenders] = useState<Record<string, SenderInfo>>({});
  const [draft, setDraft] = useState("");
  const [user, setUser] = useState<ThreadPayload["user"] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef(true);

  const cursorRef = useRef<{ createdAt: string; id: string }>({
    createdAt: "1970-01-01 00:00:00",
    id: "",
  });

  // Adaptive cadence — same trick as the portal SupportChat. Idle threads
  // (no new messages for 2 min) drop to 60s polling. Halves request volume
  // when admins leave a thread open in the background.
  const lastActivityRef = useRef(Date.now());
  const { confirm, dialog } = useConfirm();

  // Initial thread load — also seeds the cursor.
  const initialQuery = useQuery<ThreadPayload>({
    queryKey: ["admin-support-thread", userId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/support/conversations/${userId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data as ThreadPayload;
    },
    staleTime: 0,
  });

  useEffect(() => {
    const data = initialQuery.data;
    if (!data) return;
    setMessages(data.messages);
    setSenders(data.senders);
    setUser(data.user);
    const last = data.messages[data.messages.length - 1];
    cursorRef.current = last
      ? { createdAt: last.createdAt, id: last.id }
      : { createdAt: "1970-01-01 00:00:00", id: "" };
    pendingScrollRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ["admin-support-inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-support-unread"] });
  }, [initialQuery.data, queryClient]);

  // Polling for new messages — adaptive 20s/60s, paused while tab hidden.
  const pollQuery = useQuery({
    queryKey: ["admin-support-thread-poll", userId],
    queryFn: async () => {
      const params = new URLSearchParams({
        since: cursorRef.current.createdAt,
        sinceId: cursorRef.current.id,
      });
      const res = await fetch(
        `/api/admin/support/conversations/${userId}/messages?${params.toString()}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data as { messages: MessageRecord[]; senders: Record<string, SenderInfo> };
    },
    refetchInterval: () =>
      Date.now() - lastActivityRef.current > 120_000 ? 60_000 : 20_000,
    staleTime: 0,
    refetchIntervalInBackground: false,
    enabled: initialQuery.isSuccess,
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
    cursorRef.current = { createdAt: last.createdAt, id: last.id };
    lastActivityRef.current = Date.now();
    void fetch(`/api/admin/support/conversations/${userId}/read`, { method: "POST" });
    void queryClient.invalidateQueries({ queryKey: ["admin-support-inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-support-unread"] });
  }, [pollQuery.data, queryClient, userId]);

  useEffect(() => {
    if (!pendingScrollRef.current) return;
    pendingScrollRef.current = false;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(`/api/admin/support/conversations/${userId}/messages`, {
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
      cursorRef.current = { createdAt: data.message.createdAt, id: data.message.id };
      lastActivityRef.current = Date.now();
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["admin-support-inbox"] });
    },
  });

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  }

  const clearMutation = useMutation({
    mutationFn: async () => {
      // Cancel any in-flight poll before issuing DELETE — otherwise its stale
      // response (containing messages that are about to be deleted) lands
      // after our local reset and reintroduces them as "additions" until the
      // initial-thread refetch lands and replaces state.
      await queryClient.cancelQueries({ queryKey: ["admin-support-thread-poll", userId] });
      const res = await fetch(`/api/admin/support/conversations/${userId}/messages`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()).data as { cleared: number };
    },
    onSuccess: () => {
      // Reset local state + cursor; reload server state. Inbox needs a refresh
      // too because last_message_at + unread count both go to zero. Seed the
      // poll cache with an empty result so the next interval tick starts from
      // a clean slate instead of replaying whatever response was queued.
      setMessages([]);
      setSenders({});
      cursorRef.current = { createdAt: "1970-01-01 00:00:00", id: "" };
      queryClient.setQueryData(
        ["admin-support-thread-poll", userId],
        { messages: [], senders: {} }
      );
      void queryClient.invalidateQueries({ queryKey: ["admin-support-thread", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-support-inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-support-unread"] });
    },
  });

  async function handleClear() {
    if (clearMutation.isPending) return;
    const name = user?.displayName ?? "this client";
    if (
      !(await confirm({
        title: `Clear conversation with ${name}?`,
        description: "All messages will be permanently deleted on both sides. This cannot be undone.",
        confirmText: "Clear",
        destructive: true,
      }))
    ) {
      return;
    }
    clearMutation.mutate();
  }

  if (initialQuery.isLoading) {
    return (
      <div className="h-full min-h-[400px] space-y-3 p-5">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="ml-auto h-12 w-1/2" />
        <Skeleton className="h-12 w-3/5" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-16rem)] md:h-[640px]">
      <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-full bg-muted text-muted-foreground ring-1 ring-border flex items-center justify-center text-xs font-medium shrink-0">
            {user?.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.displayName ?? "Client"}</p>
            {user?.slug && (
              <p className="text-xs text-muted-foreground truncate">/{user.slug}/portal</p>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={handleClear}
          disabled={clearMutation.isPending || messages.length === 0}
          className="shrink-0 px-2.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:px-3"
          aria-label={messages.length === 0 ? "Nothing to clear" : "Clear conversation"}
          title={messages.length === 0 ? "Nothing to clear" : "Clear conversation"}
        >
          {clearMutation.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Trash2 />
          )}
          <span className="hidden sm:inline">Clear</span>
        </Button>
      </div>
      {clearMutation.isError && (
        <div className="px-5 py-2 border-b bg-destructive/10 text-destructive text-xs sm:text-sm">
          {(clearMutation.error as Error)?.message ?? "Failed to clear conversation."}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No messages yet.
          </div>
        ) : (
          messages.map((m) => {
            const isAdmin = m.senderType === "admin";
            const dt = parseISO(m.createdAt.replace(" ", "T") + "Z");
            const sender = senders[m.senderId];
            if (m.deletedAt) {
              return (
                <div key={m.id} className={cn("flex", isAdmin ? "justify-end" : "justify-start")}>
                  <span className="text-xs italic text-muted-foreground">Message deleted</span>
                </div>
              );
            }
            return (
              <div
                key={m.id}
                className={cn("flex gap-2 max-w-[80%]", isAdmin ? "ml-auto flex-row-reverse" : "")}
              >
                <div className={cn("flex flex-col", isAdmin ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
                      isAdmin
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted text-foreground rounded-tl-none"
                    )}
                  >
                    {m.body}
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-1 px-1">
                    {sender?.displayName ?? (isAdmin ? "Admin" : "Client")} · {format(dt, "MMM d, h:mm a")}
                    {m.editedAt ? " · edited" : ""}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e as unknown as React.FormEvent);
              }
            }}
            rows={1}
            placeholder="Reply…"
            className="min-h-9 max-h-32 flex-1 py-2"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || sendMutation.isPending}
            aria-label="Send"
          >
            {sendMutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send />
            )}
          </Button>
        </div>
        {sendMutation.isError && (
          <p className="text-xs text-destructive mt-2">
            {(sendMutation.error as Error)?.message ?? "Failed to send."}
          </p>
        )}
      </form>
      {dialog}
    </div>
  );
}

// ── Feedback ───────────────────────────────────────────────────────────

interface AdminFeedbackWithReplies extends AdminFeedbackEntry {
  replies: FeedbackReplyRecord[];
}

const STATUS_OPTIONS: { value: FeedbackStatus; label: string; Icon: typeof Clock }[] = [
  { value: "open", label: "Open", Icon: AlertCircle },
  { value: "in_progress", label: "In Progress", Icon: Clock },
  { value: "resolved", label: "Resolved", Icon: CheckCircle2 },
];

const STATUS_TONE: Record<FeedbackStatus, BadgeTone> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
};

/** Happy = good, neutral = plain, anything else (unhappy) = needs a look. */
function sentimentTone(sentiment: string): BadgeTone {
  return sentiment === "happy" ? "success" : sentiment === "neutral" ? "neutral" : "warning";
}

function FeedbackView({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">("all");
  const queryClient = useQueryClient();

  const { data: feedback = [], isLoading } = useQuery<AdminFeedbackWithReplies[]>({
    queryKey: ["admin-feedback", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/support/feedback?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data as AdminFeedbackWithReplies[];
    },
    refetchInterval: 90_000,
    staleTime: 45_000,
    refetchIntervalInBackground: false,
  });

  const selected = feedback.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 min-h-[600px]">
      <div
        className={cn(
          "md:col-span-5 md:border-r max-h-[70dvh] md:max-h-[640px] overflow-y-auto",
          selected && "hidden md:block"
        )}
      >
        <div className="px-4 py-3 border-b">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={statusFilter}
            onValueChange={(v) => {
              if (v) setStatusFilter(v as FeedbackStatus | "all");
            }}
            aria-label="Filter feedback by status"
            className="flex-wrap justify-start"
          >
            <ToggleGroupItem value="all" className="px-3 text-xs">
              All
            </ToggleGroupItem>
            {STATUS_OPTIONS.map(({ value, label }) => (
              <ToggleGroupItem key={value} value={value} className="px-3 text-xs">
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {isLoading ? (
          <ListSkeleton />
        ) : feedback.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No feedback in this view yet.
          </div>
        ) : (
          feedback.map((f) => (
            <FeedbackRow
              key={f.id}
              item={f}
              active={selectedId === f.id}
              onSelect={() => onSelect(f.id)}
            />
          ))
        )}
      </div>

      <div className={cn("md:col-span-7", !selected && "hidden md:block")}>
        {selected ? (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSelect("")}
              className="md:hidden h-10 w-full justify-start rounded-none border-b px-3 text-muted-foreground"
            >
              <ChevronLeft />
              All feedback
            </Button>
            {/* key forces fresh state per feedback item — otherwise replyBody
                typed on item A would still be sitting in the textarea after
                clicking item B. */}
            <FeedbackDetail
              key={selected.id}
              item={selected}
              onChange={() => {
                void queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
              }}
              onDeleted={() => {
                // Clear the lifted selection so the detail pane reverts to the
                // empty placeholder instead of holding a stale id.
                onSelect("");
                void queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
              }}
            />
          </>
        ) : (
          <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Star className="size-6" />
            <p className="text-sm">Select a feedback entry to reply.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FeedbackRow({
  item,
  active,
  onSelect,
}: {
  item: AdminFeedbackWithReplies;
  active: boolean;
  onSelect: () => void;
}) {
  const dt = parseISO(item.createdAt.replace(" ", "T") + "Z");

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left px-4 py-3 border-b transition-colors",
        active ? "bg-muted" : "hover:bg-muted/50"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground truncate">
          {item.userDisplayName ?? "Unknown"}
        </span>
        <span className="text-[11px] text-muted-foreground">{format(dt, "MMM d")}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Badge variant="outline" tone={sentimentTone(item.sentiment)} className="capitalize">
          {item.sentiment}
        </Badge>
        <span className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={cn(
                "h-3 w-3",
                n <= item.rating ? "fill-primary text-primary" : "text-muted-foreground/30"
              )}
            />
          ))}
        </span>
        {item.replyCount > 0 && (
          <span className="ml-auto text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <MessageSquare className="size-3" />
            {item.replyCount}
          </span>
        )}
      </div>
      {item.body && (
        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.body}</p>
      )}
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <BadgeDot tone={STATUS_TONE[item.status]} />
        <span className="capitalize">{item.status.replace("_", " ")}</span>
      </div>
    </button>
  );
}

function FeedbackDetail({
  item,
  onChange,
  onDeleted,
}: {
  item: AdminFeedbackWithReplies;
  onChange: () => void;
  onDeleted: () => void;
}) {
  const [replyBody, setReplyBody] = useState("");
  const { confirm, dialog } = useConfirm();

  const replyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/support/feedback/${item.id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()).data;
    },
    onSuccess: () => {
      setReplyBody("");
      onChange();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (next: FeedbackStatus) => {
      const res = await fetch(`/api/admin/support/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).data;
    },
    onSuccess: () => onChange(),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/support/feedback/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()).data as { deleted: boolean; repliesDeleted: number };
    },
    onSuccess: () => onDeleted(),
  });

  async function handleDelete() {
    if (deleteMutation.isPending) return;
    const who = item.userDisplayName ?? "this client";
    const replyHint = item.replies.length > 0 ? ` and its ${item.replies.length} repl${item.replies.length === 1 ? "y" : "ies"}` : "";
    if (
      !(await confirm({
        title: `Delete feedback from ${who}${replyHint}?`,
        description: "This cannot be undone.",
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    deleteMutation.mutate();
  }

  const dt = parseISO(item.createdAt.replace(" ", "T") + "Z");

  return (
    <div className="flex flex-col h-[calc(100dvh-16rem)] md:h-[640px]">
      <div className="px-5 py-4 border-b">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{item.userDisplayName ?? "Unknown"}</p>
            <p className="text-[11px] text-muted-foreground">{format(dt, "MMM d, yyyy · h:mm a")}</p>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_OPTIONS.map(({ value, label }) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                onClick={() => statusMutation.mutate(value)}
                disabled={statusMutation.isPending || item.status === value}
                className={cn(
                  "px-2.5 text-xs",
                  item.status === value
                    ? cn(badgeTone[STATUS_TONE[value]], "disabled:opacity-100")
                    : "text-muted-foreground"
                )}
              >
                {item.status === value && <BadgeDot tone={STATUS_TONE[value]} />}
                {label}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="ml-1 px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Delete feedback"
              title="Delete feedback"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" tone={sentimentTone(item.sentiment)} className="capitalize">
            {item.sentiment}
          </Badge>
          <span className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={cn(
                  "size-4",
                  n <= item.rating ? "fill-primary text-primary" : "text-muted-foreground/30"
                )}
              />
            ))}
          </span>
        </div>
        {deleteMutation.isError && (
          <div className={cn("mt-2 rounded-2xl border px-3 py-2 text-xs sm:text-sm", badgeTone.danger)}>
            {(deleteMutation.error as Error)?.message ?? "Failed to delete."}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {item.body && (
          <div className="rounded-2xl bg-muted/50 p-4">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{item.body}</p>
          </div>
        )}

        {item.replies.map((reply) => {
          const replyDt = parseISO(reply.createdAt.replace(" ", "T") + "Z");
          return (
            <div key={reply.id} className="ml-6 rounded-2xl p-3 ring-1 ring-foreground/5">
              <div className="flex items-center gap-2 mb-1">
                <ChevronRight className="size-3 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">
                  {reply.adminDisplayName ?? "Team"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {format(replyDt, "MMM d · h:mm a")}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{reply.body}</p>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!replyBody.trim() || replyMutation.isPending) return;
          replyMutation.mutate();
        }}
        className="p-4 border-t"
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (replyBody.trim() && !replyMutation.isPending) replyMutation.mutate();
              }
            }}
            rows={2}
            placeholder="Reply to this feedback…"
            className="min-h-9 max-h-32 flex-1 py-2"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!replyBody.trim() || replyMutation.isPending}
            aria-label="Send reply"
          >
            {replyMutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send />
            )}
          </Button>
        </div>
        {replyMutation.isError && (
          <p className="text-xs text-destructive mt-2">
            {(replyMutation.error as Error)?.message ?? "Failed to send."}
          </p>
        )}
      </form>
      {dialog}
    </div>
  );
}
