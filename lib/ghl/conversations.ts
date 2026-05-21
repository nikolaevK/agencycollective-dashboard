import { ghlRequest, getGhlConfig } from "./client";
import {
  DEFAULT_SUB_ACCOUNT_ID,
  type GhlSubAccountId,
} from "./subAccounts";
import { pickStr, pickNum, pickIso, cachedSingleflight } from "./util";
import type { GhlConversation, GhlMessage } from "@/types/ghl";

const TTL_CONTACT_THREADS = 60;         // 1 min for per-contact thread list
const TTL_THREAD_MESSAGES = 60;         // 1 min for per-thread messages
const PAGE_LIMIT = 100;
const MAX_MESSAGES_PER_THREAD = 500;    // safety cap per thread
const VERSION = "2023-02-21";



// ── Per-contact: full conversation threads ──────────────────────────

function normConversation(raw: Record<string, unknown>): GhlConversation {
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    contactId: pickStr(raw, "contactId", "contact_id", "contact.id") ?? "",
    type: pickStr(raw, "type"),
    unreadCount: pickNum(raw, "unreadCount", "unread_count") ?? 0,
    lastMessageType: pickStr(raw, "lastMessageType", "last_message_type"),
    lastMessageDate: pickIso(raw, "lastMessageDate", "last_message_date", "lastMessageAt"),
    lastMessageBody: pickStr(raw, "lastMessageBody", "last_message_body"),
    lastMessageDirection: pickStr(raw, "lastMessageDirection", "last_message_direction"),
  };
}

/**
 * Threads belonging to a single contact. Returns newest-first.
 *
 * Paginates beyond the first 100 threads — power users with very long contact
 * histories (multiple channels × years) can have more than the page cap.
 */
const MAX_CONTACT_THREADS = 500;

export async function getContactConversations(
  contactId: string,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlConversation[]> {
  const { locationId } = getGhlConfig(subAccountId);
  return cachedSingleflight(
    `ghl:contact-threads:${subAccountId}:${contactId}`,
    TTL_CONTACT_THREADS,
    async () => {
    const all: GhlConversation[] = [];
    let page = 1;
    while (all.length < MAX_CONTACT_THREADS) {
      const raw = await ghlRequest<unknown>("/conversations/search", {
        query: { locationId, contactId, limit: PAGE_LIMIT, page },
        version: VERSION,
        subAccountId,
      });
      let list: unknown[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && typeof raw === "object") {
        const top = raw as Record<string, unknown>;
        if (Array.isArray(top.conversations)) list = top.conversations as unknown[];
        else if (Array.isArray(top.data)) list = top.data as unknown[];
      }
      if (list.length === 0) break;

      const batch = list.map((c) => normConversation(c as Record<string, unknown>));
      all.push(...batch);
      if (batch.length < PAGE_LIMIT) break;
      page += 1;
    }

    const threads = all.sort((a, b) => {
      const av = a.lastMessageDate ? Date.parse(a.lastMessageDate) : 0;
      const bv = b.lastMessageDate ? Date.parse(b.lastMessageDate) : 0;
      return bv - av;
    });
    return threads;
    }
  );
}

// ── Per-thread: messages ────────────────────────────────────────────

function normDirection(raw: unknown): "inbound" | "outbound" {
  // GHL has shipped this as a string ("inbound"/"outbound"), as a numeric
  // enum (1=inbound, 2=outbound in older versions), and occasionally as a
  // type prefix on the message itself (e.g. TYPE_SMS_OUT). Cover the
  // common shapes; default inbound only when we genuinely can't tell.
  if (typeof raw === "number") return raw === 2 ? "outbound" : "inbound";
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  if (s.includes("outbound") || s === "out" || s.endsWith("_out")) return "outbound";
  if (s.includes("inbound") || s === "in" || s.endsWith("_in")) return "inbound";
  return "inbound";
}

function normMessage(raw: Record<string, unknown>): GhlMessage {
  // Direction can come from `direction` or, on older messages, only from
  // `messageType` containing `_OUT` / `_IN`. Use pickStr semantics — first
  // non-empty string — so an explicit "" doesn't poison the chain.
  const directionRaw =
    pickStr(raw, "direction") ??
    pickStr(raw, "messageType", "message_type") ??
    pickStr(raw, "type") ??
    (typeof raw.direction === "number" ? raw.direction : null);
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    conversationId: pickStr(raw, "conversationId", "conversation_id") ?? "",
    type: pickStr(raw, "type", "messageType", "message_type") ?? "TYPE_UNKNOWN",
    direction: normDirection(directionRaw),
    dateAdded:
      pickIso(raw, "dateAdded", "date_added", "createdAt", "created_at") ?? "",
    body: pickStr(raw, "body", "message", "text", "content"),
    status: pickStr(raw, "status"),
    attachments: Array.isArray(raw.attachments)
      ? (raw.attachments as unknown[])
          .map((a) =>
            typeof a === "string" ? a : pickStr(a, "url", "link", "src") ?? ""
          )
          .filter(Boolean)
      : [],
    userId: pickStr(raw, "userId", "user_id", "user.id"),
  };
}

/**
 * Messages within a thread, newest-first. Capped at MAX_MESSAGES_PER_THREAD
 * so a runaway-spam thread can't pin the UI for ages.
 *
 * GHL paginates this endpoint via `lastMessageId` rather than page numbers.
 */
export async function getConversationMessages(
  conversationId: string,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlMessage[]> {
  return cachedSingleflight(
    `ghl:thread-messages:${subAccountId}:${conversationId}`,
    TTL_THREAD_MESSAGES,
    async () => {
    const all: GhlMessage[] = [];
    let lastMessageId: string | null = null;

  while (all.length < MAX_MESSAGES_PER_THREAD) {
    const raw = await ghlRequest<unknown>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        query: { limit: PAGE_LIMIT, lastMessageId: lastMessageId ?? undefined },
        version: VERSION,
        subAccountId,
      }
    );
    // GHL has shipped this response in three different shapes across versions:
    //   1. { messages: [...] }
    //   2. { messages: { messages: [...], lastMessageId: "..." } }
    //   3. [ ... ]   (rare, very old)
    let list: unknown[] = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === "object") {
      const top = raw as Record<string, unknown>;
      const messagesField = top.messages;
      if (Array.isArray(messagesField)) {
        list = messagesField;
      } else if (messagesField && typeof messagesField === "object") {
        const inner = (messagesField as Record<string, unknown>).messages;
        if (Array.isArray(inner)) list = inner;
      } else if (Array.isArray(top.data)) {
        list = top.data as unknown[];
      }
    }
    if (list.length === 0) break;
    const batch = list.map((m) => normMessage(m as Record<string, unknown>));
    all.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
    lastMessageId = batch[batch.length - 1].id;
    if (!lastMessageId) break;
  }

      return all;
    }
  );
}
