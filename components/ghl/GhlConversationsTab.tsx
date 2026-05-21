"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  MessageSquare,
  Mail,
  Phone,
  PhoneCall,
  Voicemail,
  Globe,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useGhlContactConversations,
  useGhlConversationMessages,
} from "@/hooks/useGhlContacts";
import { useActiveGhlSubAccount } from "./GhlSubAccountContext";
import type { GhlConversation, GhlMessage, GhlUser } from "@/types/ghl";

interface Props {
  contactId: string;
  users: Record<string, GhlUser>;
}

export function GhlConversationsTab({ contactId, users }: Props) {
  const sub = useActiveGhlSubAccount();
  const threadsQuery = useGhlContactConversations(contactId, sub);
  // Memoize the empty-array fallback so the dependency identity is stable
  // across re-renders (otherwise the auto-select effect re-fires every time).
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Auto-select the most-recently-active thread on first load, and re-select
  // when the contact changes or the active thread disappears.
  useEffect(() => {
    if (threads.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !threads.some((t) => t.id === activeId)) {
      setActiveId(threads[0].id);
    }
  }, [threads, activeId]);

  if (threadsQuery.error) {
    return <ErrorBox message={(threadsQuery.error as Error).message} />;
  }

  if (threadsQuery.isLoading) {
    return <LoadingState />;
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
        <MessageSquare className="h-8 w-8 opacity-40" />
        <p className="text-sm">No conversations for this contact.</p>
      </div>
    );
  }

  // Layout note: the parent tab content area (.flex-1.overflow-y-auto in
  // GhlContactDetail) is the single scroll container. We don't open a second
  // scroll inside this tab — nested scroll regions break wheel-event capture
  // and `h-full` doesn't behave inside an overflow-auto parent. Thread
  // switcher + messages flow naturally; the parent scrolls the whole thing.
  return (
    <div className="flex flex-col gap-3">
      {threads.length > 1 && (
        <ThreadSwitcher
          threads={threads}
          activeId={activeId}
          onSelect={setActiveId}
        />
      )}
      {activeId && <MessageStream conversationId={activeId} users={users} />}
    </div>
  );
}

// ── Thread switcher ──────────────────────────────────────────────────

function ThreadSwitcher({
  threads,
  activeId,
  onSelect,
}: {
  threads: GhlConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border/40 pb-2 mb-3">
      {threads.map((t) => {
        const Icon = channelIcon(t.lastMessageType ?? t.type);
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "border-foreground/40 bg-foreground/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            )}
            title={channelLabel(t.lastMessageType ?? t.type) + (t.lastMessageDate ? ` · last ${formatRelative(t.lastMessageDate)}` : "")}
          >
            <Icon className="h-3 w-3" />
            {channelLabel(t.lastMessageType ?? t.type)}
            {t.unreadCount > 0 && (
              <span className="rounded-full bg-foreground/15 px-1.5 text-[10px]">
                {t.unreadCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Message stream ───────────────────────────────────────────────────

function MessageStream({
  conversationId,
  users,
}: {
  conversationId: string;
  users: Record<string, GhlUser>;
}) {
  const sub = useActiveGhlSubAccount();
  const { data, isLoading, error } = useGhlConversationMessages(conversationId, sub);

  // Sort oldest → newest for chat-style top-to-bottom rendering. GHL returns
  // newest-first. Guard against NaN: any malformed/missing dateAdded sorts
  // to the top of the thread (treated as "earliest" which is the natural
  // place for ambiguous timestamps in chat).
  const messages = useMemo(() => {
    if (!data) return [];
    const tof = (iso: string | null | undefined): number => {
      if (!iso) return 0;
      const t = Date.parse(iso);
      return Number.isFinite(t) ? t : 0;
    };
    return [...data].sort((a, b) => tof(a.dateAdded) - tof(b.dateAdded));
  }, [data]);

  if (error) return <ErrorBox message={(error as Error).message} />;
  if (isLoading) return <LoadingState />;

  if (messages.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Empty thread.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {messages.map((m, i) => {
        const prev = i > 0 ? messages[i - 1] : null;
        const showDaySep = !prev || !sameDay(prev.dateAdded, m.dateAdded);
        // Resolve sender name HERE so MessageBubble never sees the
        // volatile users Record — keeps its React.memo intact across
        // user-catalog refetches.
        const sender = m.direction === "outbound" ? userDisplay(users, m.userId) : null;
        return (
          <li key={m.id || i}>
            {showDaySep && <DaySeparator iso={m.dateAdded} />}
            <MessageBubble msg={m} sender={sender} />
          </li>
        );
      })}
    </ul>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <div className="h-px flex-1 bg-border/40" />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {formatDayLabel(iso)}
      </span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

// Memoized: only re-renders when `msg` or `sender` changes. Sender is
// resolved upstream into a plain string so bubble memo isn't busted by
// the user-catalog query refetching every 15 min.
const MessageBubble = memo(function MessageBubble({
  msg,
  sender,
}: {
  msg: GhlMessage;
  sender: string | null;
}) {
  const isOutbound = msg.direction === "outbound";
  const Icon = channelIcon(msg.type);
  // Email-body HTML cleanup is the heaviest per-render work in this tab.
  // Memo per `msg.body`/`msg.type` so it only runs on actual message change.
  const body = useMemo(() => formatMessageBody(msg), [msg.body, msg.type]);

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isOutbound ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px]",
          isOutbound
            ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
            : "bg-muted text-muted-foreground"
        )}
        title={channelLabel(msg.type)}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
          isOutbound
            ? "bg-blue-500 text-white rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        )}
      >
        {body ? (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{body}</p>
        ) : (
          <p className="italic opacity-70">(empty message)</p>
        )}
        {msg.attachments.length > 0 && (
          <ul className="mt-1.5 space-y-1 text-[11px]">
            {msg.attachments.map((url, i) => {
              // Defense-in-depth: only render http(s) attachments. A
              // `javascript:` or `data:` URL on click would execute in
              // the user's session — GHL's own attachments are always
              // HTTPS so this should never block a legitimate one.
              const safe = isSafeHttpUrl(url);
              return (
                <li key={i}>
                  {safe ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "underline decoration-dotted",
                        isOutbound ? "text-white/90" : "text-foreground"
                      )}
                    >
                      attachment {i + 1}
                    </a>
                  ) : (
                    <span
                      className={cn(
                        "italic",
                        isOutbound ? "text-white/70" : "text-muted-foreground"
                      )}
                      title={url}
                    >
                      attachment {i + 1} (blocked: unsafe URL)
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 text-[10px]",
            isOutbound ? "text-white/70 justify-end" : "text-muted-foreground"
          )}
        >
          <span>{formatTime(msg.dateAdded)}</span>
          {sender && <span className="opacity-80">· {sender}</span>}
          {msg.status && msg.status.toLowerCase() !== "delivered" && (
            <span className="opacity-80">· {msg.status}</span>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Helpers ──────────────────────────────────────────────────────────

/** Block javascript:, data:, vbscript:, file:, etc. URLs — only allow http(s). */
function isSafeHttpUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function userDisplay(users: Record<string, GhlUser>, id: string | null): string | null {
  if (!id) return null;
  const u = users[id];
  if (!u) return null;
  return u.name || u.email || null;
}

function channelIcon(type: string | null): typeof MessageSquare {
  const t = (type ?? "").toLowerCase();
  if (t.includes("sms")) return Phone;
  if (t.includes("email")) return Mail;
  if (t.includes("call")) return PhoneCall;
  if (t.includes("voicemail")) return Voicemail;
  if (t.includes("phone")) return Phone;
  if (t.includes("webchat") || t.includes("chat")) return Globe;
  if (t.includes("fb") || t.includes("facebook")) return MessageSquare;
  if (t.includes("ig") || t.includes("instagram")) return MessageSquare;
  return MessageSquare;
}

function channelLabel(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("sms")) return "SMS";
  if (t.includes("email")) return "Email";
  if (t.includes("call")) return "Call";
  if (t.includes("voicemail")) return "Voicemail";
  if (t.includes("phone")) return "Phone";
  if (t.includes("webchat")) return "Web chat";
  if (t.includes("fb") || t.includes("facebook")) return "Facebook";
  if (t.includes("ig") || t.includes("instagram")) return "Instagram";
  if (t.includes("gmb")) return "Google Business";
  return "Message";
}

function formatMessageBody(msg: GhlMessage): string {
  // Email bodies often arrive as HTML. Strip tags for the bubble view —
  // a richer renderer would be overkill for v1.
  if (!msg.body) return "";
  if (msg.type.toLowerCase().includes("email") && /<[a-z][^>]*>/i.test(msg.body)) {
    return msg.body
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return msg.body;
}

function sameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDayLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d.toISOString(), today.toISOString())) return "Today";
  if (sameDay(d.toISOString(), yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function formatRelative(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const days = Math.round((Date.now() - ms) / 86_400_000);
  if (Math.abs(days) < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading conversation…
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <div className="flex items-center gap-2 text-destructive font-medium">
        <AlertTriangle className="h-4 w-4" />
        Couldn’t load conversation
      </div>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{message}</p>
    </div>
  );
}
