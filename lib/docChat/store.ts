/**
 * In-memory state for the document assistants that has to outlive the chat
 * component (client-only, this tab, cleared on reload). The hosting pages
 * unmount the chat on a tab switch, and the SOP page replaces it with the
 * builder on "Open in builder" — without this the conversation (and the
 * generated documents in it) vanished every time.
 *
 * Conversations are keyed per admin, so another admin signing in on the same
 * tab (logout is a client-side navigation) never sees them.
 */

import type { ChatMessage } from "@/types/chat";

const conversations = new Map<string, ChatMessage[]>();

export function loadConversation(key: string): ChatMessage[] {
  return conversations.get(key) ?? [];
}

export function saveConversation(key: string, messages: ChatMessage[]): void {
  if (messages.length === 0) conversations.delete(key);
  else conversations.set(key, messages);
}

/**
 * Generated items already saved (tool_use id → saved record id, "" when the
 * save has no id to reopen) — so a card shows "Saved" after a remount instead
 * of inviting a duplicate save.
 */
const savedOutputs = new Map<string, string>();

export function savedOutput(toolUseId: string): string | undefined {
  return savedOutputs.get(toolUseId);
}

export function markOutputSaved(toolUseId: string, recordId = ""): void {
  savedOutputs.set(toolUseId, recordId);
}
