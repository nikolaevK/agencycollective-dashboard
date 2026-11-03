// In-memory multi-turn store for the image route. Gemini's generateContent is
// stateless, so the turns (with the model's thought signatures) live here
// between requests. Per-process only: another serverless instance or a cold
// start won't have a conversation, and the route answers
// `conversation_expired` so the client can restart from its latest image.
// Bounded so an instance can't hoard images: idle TTL, a per-admin cap, a
// global count cap and a global byte cap (least recently used evicted first,
// never one in flight), and each history is kept under HISTORY_BUDGET_BYTES
// by the route.

import type { Content } from "@google/genai";
import { historyBytes } from "./geminiResult";

export interface Conversation {
  id: string;
  adminId: string;
  model: string;
  history: Content[];
  lastUsed: number;
  busy: boolean;
}

export interface ConversationStoreOptions {
  ttlMs: number;
  maxTotal: number;
  maxPerAdmin: number;
  /** Total history bytes across all conversations. */
  maxBytes: number;
}

export type ConversationLookup =
  | { ok: true; conversation: Conversation }
  | { ok: false; code: "conversation_expired" | "conversation_busy" };

export class ConversationStore {
  private readonly items = new Map<string, Conversation>();

  constructor(
    private readonly options: ConversationStoreOptions,
    private readonly now: () => number = Date.now
  ) {}

  get size(): number {
    return this.items.size;
  }

  private evictExpired(): void {
    const cutoff = this.now() - this.options.ttlMs;
    this.items.forEach((c, id) => {
      if (!c.busy && c.lastUsed < cutoff) this.items.delete(id);
    });
  }

  /** The admin's conversation for this model, if this process still holds it. */
  lookup(id: string, adminId: string, model: string): ConversationLookup {
    this.evictExpired();
    const conversation = this.items.get(id);
    // A foreign id reads exactly like an expired one — no probing.
    if (!conversation || conversation.adminId !== adminId || conversation.model !== model) {
      return { ok: false, code: "conversation_expired" };
    }
    if (conversation.busy) return { ok: false, code: "conversation_busy" };
    return { ok: true, conversation };
  }

  /** Mark in flight (one turn at a time per conversation). */
  begin(conversation: Conversation): void {
    conversation.busy = true;
    conversation.lastUsed = this.now();
  }

  end(conversation: Conversation): void {
    conversation.busy = false;
    conversation.lastUsed = this.now();
  }

  /** Start a conversation with its first turn; evicts the admin's / the instance's oldest. */
  create(id: string, adminId: string, model: string, history: Content[]): Conversation {
    this.evictExpired();
    const conversation: Conversation = { id, adminId, model, history, lastUsed: this.now(), busy: false };
    this.items.set(id, conversation);
    this.enforceCap((c) => c.adminId === adminId, this.options.maxPerAdmin);
    this.enforceCap(() => true, this.options.maxTotal);
    this.enforceBytes();
    return conversation;
  }

  /** Store a conversation's history after a turn (re-applies the byte cap). */
  setHistory(conversation: Conversation, history: Content[]): void {
    conversation.history = history;
    this.enforceBytes();
  }

  delete(id: string): void {
    this.items.delete(id);
  }

  private enforceCap(match: (c: Conversation) => boolean, cap: number): void {
    const idle = Array.from(this.items.values())
      .filter((c) => match(c))
      .sort((a, b) => a.lastUsed - b.lastUsed);
    let excess = idle.length - cap;
    for (const c of idle) {
      if (excess <= 0) break;
      if (c.busy) continue;
      this.items.delete(c.id);
      excess--;
    }
  }

  private enforceBytes(): void {
    const byAge = Array.from(this.items.values()).sort((a, b) => a.lastUsed - b.lastUsed);
    let total = byAge.reduce((sum, c) => sum + historyBytes(c.history), 0);
    for (const c of byAge) {
      if (total <= this.options.maxBytes) break;
      if (c.busy) continue;
      this.items.delete(c.id);
      total -= historyBytes(c.history);
    }
  }
}
