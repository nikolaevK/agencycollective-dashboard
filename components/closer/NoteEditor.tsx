"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Eye, EyeOff, Hash, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotePriority, NoteRecord } from "@/lib/notes";
import { NOTE_BODY_MAX, NOTE_TITLE_MAX } from "@/lib/notes";
import { LeadPicker } from "@/components/closer/LeadPicker";
import { SharePicker } from "@/components/closer/SharePicker";

interface NoteWithShares extends NoteRecord {
  sharedWith?: string[];
}

interface Props {
  note?: NoteWithShares | null;
  initialLeadLabel?: string | null;
  initialLeadKind?: "appointment" | "deal" | "no_show" | null;
  onClose: () => void;
  onSaved: () => void;
}

const INPUT_CLS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

type LinkedLead = {
  googleEventId: string | null;
  dealId: string | null;
  label: string;
  kind: "appointment" | "deal" | "no_show";
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
  function inferredKind(): "appointment" | "deal" | "no_show" {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4 rounded-t-2xl">
          <h3 className="text-lg font-semibold text-foreground">{isEdit ? "Edit note" : "New note"}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Call Kyle back about pricing"
              required
              maxLength={NOTE_TITLE_MAX}
              className={INPUT_CLS}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground">Body (markdown supported)</label>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>
            {showPreview ? (
              <div className="min-h-32 rounded-lg border border-input bg-background px-3 py-2 text-sm max-h-80 overflow-y-auto">
                {body ? (
                  <ReactMarkdown>{body}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground italic">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="**Context:** …\n\n- Action items\n- Deadlines"
                rows={8}
                maxLength={NOTE_BODY_MAX}
                className={cn(INPUT_CLS, "h-auto py-2 font-mono text-xs")}
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as NotePriority)}
                className={INPUT_CLS}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Due date (optional)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tags</label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 min-h-10">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-foreground"
                >
                  <Hash className="h-3 w-3" />
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove tag ${t}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
                placeholder={tags.length === 0 ? "followup, pricing (press Enter)" : ""}
                className="flex-1 min-w-[8rem] h-7 bg-transparent text-sm focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Press Enter or comma to add a tag. Up to 12 tags.</p>
          </div>

          <LeadPicker value={lead} onChange={setLead} />

          <SharePicker value={sharedWith} onChange={setSharedWith} />

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="h-9 rounded-lg ac-gradient px-5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving..." : isEdit ? "Save changes" : "Create note"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
