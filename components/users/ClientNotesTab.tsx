"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Bell, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/use-confirm";
import { formatDate } from "./format";
import type { ClientNote } from "@/lib/clientNotes";

async function fetchNotes(userId: string): Promise<ClientNote[]> {
  const res = await fetch(`/api/admin/clients/${userId}/notes`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as ClientNote[];
}

/** "yyyy-mm-dd" in the viewer's local calendar, `addDays` from today. */
function localYmd(addDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Reminder chip tone (display only): overdue = danger, due within 3 days =
 *  warning, later = info, done = neutral. */
function reminderTone(note: ClientNote): { tone: BadgeTone; hint: string } {
  if (note.done || !note.remindAt) return { tone: "neutral", hint: "Reminder" };
  const due = note.remindAt.slice(0, 10);
  if (due < localYmd()) return { tone: "danger", hint: "Overdue" };
  if (due <= localYmd(3)) return { tone: "warning", hint: "Due soon" };
  return { tone: "info", hint: "Reminder" };
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
  const { confirm, dialog } = useConfirm();

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
    if (
      !(await confirm({
        title: "Delete this note?",
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
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
      <Card className="space-y-3 p-4 md:p-5">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add an internal note or reminder…"
          className="resize-y"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="client-note-remind-at" className="font-normal text-muted-foreground">
            <Bell className="size-4" />
            Remind on
          </Label>
          <DatePicker
            id="client-note-remind-at"
            value={remindAt}
            onValueChange={setRemindAt}
            placeholder="No reminder"
            className="w-44"
          />
          <Button
            onClick={handleAdd}
            disabled={busy || !body.trim()}
            className="ml-auto"
          >
            <Plus />
            Add note
          </Button>
        </div>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-3xl" />
          <Skeleton className="h-24 w-full rounded-3xl" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          No notes yet for this client.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const reminder = reminderTone(note);
            return (
              <Card
                key={note.id}
                className={cn("p-4", note.done && "opacity-60")}
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
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                      <span>{note.authorName ?? "Admin"}</span>
                      <span>·</span>
                      <span>{formatDate(note.createdAt)}</span>
                      {note.remindAt && (
                        <Badge
                          variant="outline"
                          tone={reminder.tone}
                          className="tabular-nums"
                          title={reminder.hint}
                        >
                          <Clock />
                          {formatDate(note.remindAt)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {note.remindAt && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => toggleDone(note)}
                        title={note.done ? "Mark as open" : "Mark as done"}
                        aria-label={note.done ? "Mark as open" : "Mark as done"}
                        className={cn(
                          note.done
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        )}
                      >
                        <Check />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(note)}
                      title="Delete"
                      aria-label="Delete"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {dialog}
    </div>
  );
}
