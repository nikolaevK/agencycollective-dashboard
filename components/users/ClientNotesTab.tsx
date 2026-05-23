"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Bell, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "./format";
import type { ClientNote } from "@/lib/clientNotes";

async function fetchNotes(userId: string): Promise<ClientNote[]> {
  const res = await fetch(`/api/admin/clients/${userId}/notes`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as ClientNote[];
}

export function ClientNotesTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["client-notes", userId],
    queryFn: () => fetchNotes(userId),
    staleTime: 30_000,
  });

  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [busy, setBusy] = useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["client-notes", userId] });
    queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
  }

  async function handleAdd() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${userId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), remindAt: remindAt || null }),
      });
      if (res.ok) {
        setBody("");
        setRemindAt("");
        invalidate();
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone(note: ClientNote) {
    const res = await fetch(`/api/admin/clients/${userId}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: note.id, done: !note.done }),
    });
    if (!res.ok) {
      alert("Failed to update note.");
      return;
    }
    invalidate();
  }

  async function remove(note: ClientNote) {
    if (!confirm("Delete this note?")) return;
    const res = await fetch(
      `/api/admin/clients/${userId}/notes?id=${encodeURIComponent(note.id)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      alert("Failed to delete note.");
      return;
    }
    invalidate();
  }

  return (
    <div className="space-y-6">
      {/* Composer */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add an internal note or reminder…"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bell className="h-4 w-4" />
            Remind on
            <input
              type="date"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="rounded-lg border bg-background px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={handleAdd}
            disabled={busy || !body.trim()}
            className="ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add note
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="h-32 w-full animate-pulse rounded-xl bg-muted/50" />
      ) : notes.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          No notes yet for this client.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className={cn(
                "rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4",
                note.done && "opacity-60"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm text-foreground whitespace-pre-wrap break-words",
                      note.done && "line-through"
                    )}
                  >
                    {note.body}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{note.authorName ?? "Admin"}</span>
                    <span>·</span>
                    <span>{formatDate(note.createdAt)}</span>
                    {note.remindAt && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                          note.done
                            ? "bg-muted text-muted-foreground"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {formatDate(note.remindAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {note.remindAt && (
                    <button
                      onClick={() => toggleDone(note)}
                      title={note.done ? "Mark as open" : "Mark as done"}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        note.done
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => remove(note)}
                    title="Delete"
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
