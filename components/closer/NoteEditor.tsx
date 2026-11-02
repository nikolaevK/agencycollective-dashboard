"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Eye, EyeOff, Hash, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotePriority, NoteRecord } from "@/lib/notes";
import { NOTE_BODY_MAX, NOTE_TITLE_MAX } from "@/lib/noteRules";
import { LeadPicker } from "@/components/closer/LeadPicker";
import { SharePicker } from "@/components/closer/SharePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface NoteWithShares extends NoteRecord {
  sharedWith?: string[];
}

interface Props {
  note?: NoteWithShares | null;
  initialLeadLabel?: string | null;
  initialLeadKind?: "appointment" | "deal" | "no_show" | "showed" | null;
  onClose: () => void;
  onSaved: () => void;
}

type LinkedLead = {
  googleEventId: string | null;
  dealId: string | null;
  label: string;
  kind: "appointment" | "deal" | "no_show" | "showed";
} | null;

const PRIORITY_OPTIONS: { value: NotePriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function NoteEditor({ note, initialLeadLabel, initialLeadKind, onClose, onSaved }: Props) {
  const isEdit = !!note;

  // Fall back to a sensible kind when the caller didn't supply one: if the
  // note only has a dealId (no google_event_id), it's a deal; otherwise an
  // appointment. Prevents the chip from always showing "Appointment" for
  // stored deal/no-show references.
  function inferredKind(): NonNullable<LinkedLead>["kind"] {
    if (initialLeadKind) return initialLeadKind;
    if (note?.linkedDealId && !note?.linkedGoogleEventId) return "deal";
    return "appointment";
  }

  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [priority, setPriority] = useState<NotePriority>(note?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(note?.dueDate ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [lead, setLead] = useState<LinkedLead>(
    note?.linkedGoogleEventId || note?.linkedDealId
      ? {
          googleEventId: note.linkedGoogleEventId ?? null,
          dealId: note.linkedDealId ?? null,
          label: initialLeadLabel ?? "Linked lead",
          kind: inferredKind(),
        }
      : null
  );
  const [sharedWith, setSharedWith] = useState<string[]>(note?.sharedWith ?? []);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setBody(note.body);
      setPriority(note.priority);
      setDueDate(note.dueDate ?? "");
      setTags(note.tags);
      setLead(
        note.linkedGoogleEventId || note.linkedDealId
          ? {
              googleEventId: note.linkedGoogleEventId ?? null,
              dealId: note.linkedDealId ?? null,
              label: initialLeadLabel ?? "Linked lead",
              kind:
                initialLeadKind ??
                (note.linkedDealId && !note.linkedGoogleEventId ? "deal" : "appointment"),
            }
          : null
      );
      setSharedWith(note.sharedWith ?? []);
    }
  }, [note, initialLeadLabel, initialLeadKind]);

  function addTag(raw: string) {
    const trimmed = raw.trim().replace(/^#/, "");
    if (!trimmed) return;
    if (tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
  }

  function handleTagKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (tagInput.trim()) {
        addTag(tagInput);
        setTagInput("");
      }
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }
    if (trimmedTitle.length > NOTE_TITLE_MAX) {
      setError(`Title must be ${NOTE_TITLE_MAX} characters or fewer`);
      return;
    }
    if (body.length > NOTE_BODY_MAX) {
      setError(`Body must be ${NOTE_BODY_MAX} characters or fewer`);
      return;
    }

    // If the tag input still has unsubmitted text, commit it.
    const finalTags = [...tags];
    if (tagInput.trim()) {
      const extra = tagInput.trim().replace(/^#/, "");
      if (extra && !finalTags.includes(extra)) finalTags.push(extra);
    }

    const payload = {
      title: trimmedTitle,
      body,
      priority,
      dueDate: dueDate || null,
      tags: finalTags,
      linkedGoogleEventId: lead?.googleEventId ?? null,
      linkedDealId: lead?.dealId ?? null,
      sharedWith,
    };

    setSaving(true);
    try {
      const res = isEdit && note
        ? await fetch(`/api/closer/notes/${note.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/closer/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error ?? "Failed to save");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className={dialogOverlayClass} onClick={onClose} />
      <div className={cn(dialogPanelClass, "relative z-50 w-full max-w-2xl mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain")}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-popover px-4 py-4 sm:px-6">
          <h3 className="text-base font-medium">{isEdit ? "Edit note" : "New note"}</h3>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="-mr-2">
            <span className="sr-only">Close</span>
            <X />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-5 sm:p-6">
          {error && (
            <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="note-title">Title</Label>
            <Input
              id="note-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Call Kyle back about pricing"
              required
              maxLength={NOTE_TITLE_MAX}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="note-body">Body (markdown supported)</Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowPreview((v) => !v)}
                className="text-muted-foreground"
              >
                {showPreview ? <EyeOff /> : <Eye />}
                {showPreview ? "Edit" : "Preview"}
              </Button>
            </div>
            {showPreview ? (
              <div className="min-h-32 rounded-2xl bg-muted/40 px-3 py-3 text-sm max-h-80 overflow-y-auto">
                {body ? (
                  <ReactMarkdown
                    components={{
                      // Keep fenced code blocks inside the preview card on
                      // narrow screens instead of overflowing horizontally.
                      pre: (p: { children?: React.ReactNode }) => (
                        <pre className="overflow-x-auto rounded-2xl bg-muted p-3 text-xs font-mono my-2">
                          {p.children}
                        </pre>
                      ),
                    }}
                  >
                    {body}
                  </ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground italic">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <Textarea
                id="note-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={"**Context:** …\n\n- Action items\n- Deadlines"}
                rows={8}
                maxLength={NOTE_BODY_MAX}
                className="resize-y font-mono md:text-xs"
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="note-priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as NotePriority)}>
                <SelectTrigger id="note-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-due">Due date (optional)</Label>
              <DatePicker id="note-due" value={dueDate} onValueChange={setDueDate} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note-tags">Tags</Label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-3xl border border-transparent bg-input/50 px-2 py-1 min-h-9 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="max-w-full">
                  <Hash />
                  <span className="truncate">{t}</span>
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove tag ${t}`}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                id="note-tags"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
                placeholder={tags.length === 0 ? "followup, pricing (press Enter)" : ""}
                className="flex-1 min-w-[8rem] h-7 bg-transparent px-1 text-base placeholder:text-muted-foreground focus:outline-none md:text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">Press Enter or comma to add a tag. Up to 12 tags.</p>
          </div>

          <LeadPicker value={lead} onChange={setLead} />

          <SharePicker value={sharedWith} onChange={setSharedWith} />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Saving..." : isEdit ? "Save changes" : "Create note"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
