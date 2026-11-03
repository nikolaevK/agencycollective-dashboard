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
/** Saves still in flight (tool_use id → the save), so a remounted card joins one instead of starting another. */
const pendingSaves = new Map<string, Promise<string>>();

export function savedOutput(toolUseId: string): string | undefined {
  return savedOutputs.get(toolUseId);
}

/** The save in flight for this item, if any (a card that mounts mid-save waits on it). */
export function pendingOutputSave(toolUseId: string): Promise<string> | undefined {
  return pendingSaves.get(toolUseId);
}

/**
 * Save a generated item at most once: an item already saved resolves to its
 * record id, a save already running (started by a card that has since
 * unmounted) is joined, otherwise `save` runs. Resolves the record id ("" when
 * there is none); a failed save rejects and can be tried again.
 */
export function saveOutputOnce(toolUseId: string, save: () => Promise<string | void>): Promise<string> {
  const saved = savedOutputs.get(toolUseId);
  if (saved !== undefined) return Promise.resolve(saved);
  let pending = pendingSaves.get(toolUseId);
  if (!pending) {
    pending = save()
      .then((recordId) => {
        savedOutputs.set(toolUseId, recordId ?? "");
        return recordId ?? "";
      })
      .finally(() => pendingSaves.delete(toolUseId));
    pendingSaves.set(toolUseId, pending);
  }
  return pending;
}
