"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteRecord, SharedNoteRecord } from "@/lib/notes";
import { NoteCard } from "@/components/closer/NoteCard";
import { NoteEditor } from "@/components/closer/NoteEditor";
import { LeadContextModal } from "@/components/closer/LeadContextModal";

interface OwnNote extends NoteRecord {
  sharedWith: string[];
}

interface NotesResponse {
  own: OwnNote[];
  sharedWithMe: SharedNoteRecord[];
  sharedArchived: SharedNoteRecord[];
}

type GroupMode = "priority" | "due" | "tag" | "lead";

interface LeadRef {
  googleEventId: string | null;
  dealId: string | null;
  label: string;
  kind: "appointment" | "deal" | "no_show" | "showed";
}

/**
 * Shared notes board used by closer AND setter — no role-specific behavior;
 * ownership filter lives in `/api/closer/notes`. Grouping is client-side;
 * data already fits in a single query.
 */
export function NotesBoard({ heading }: { heading: string }) {
  const queryClient = useQueryClient();
  const [groupMode, setGroupMode] = useState<GroupMode>("priority");
  const [editingNote, setEditingNote] = useState<OwnNote | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewingLead, setViewingLead] = useState<
    { googleEventId: string | null; dealId: string | null; label: string } | null
  >(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading } = useQuery<NotesResponse>({
    queryKey: ["closer-notes"],
    queryFn: async () => {
      const res = await fetch("/api/closer/notes");
      if (!res.ok) return { own: [], sharedWithMe: [], sharedArchived: [] };
      const json = await res.json();
      return json.data ?? { own: [], sharedWithMe: [], sharedArchived: [] };
    },
    staleTime: 30_000,
  });

  // Visiting the notes page clears the sidebar badge. We mark-viewed on
  // every successful load (including subsequent refetches) so a user who
  // stays on the page doesn't get a stale badge when a new share arrives
  // while they're looking at the list.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    fetch("/api/closer/notes/mark-viewed", { method: "POST" }).then(() => {
      if (!cancelled) {
        queryClient.invalidateQueries({ queryKey: ["notes-unread"] });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [data, queryClient]);

  // Merge for grouping. Each note carries a stable marker so card render
  // can distinguish owner vs recipient and surface the correct badge.
  const notes = useMemo<NoteRecord[]>(
    () => [...(data?.own ?? []), ...(data?.sharedWithMe ?? [])],
    [data]
  );
  const ownIds = useMemo(() => new Set((data?.own ?? []).map((n) => n.id)), [data]);
  const ownById = useMemo(() => {
    const m = new Map<string, OwnNote>();
    for (const n of data?.own ?? []) m.set(n.id, n);
    return m;
  }, [data]);
  const sharedById = useMemo(() => {
    const m = new Map<string, SharedNoteRecord>();
    for (const n of data?.sharedWithMe ?? []) m.set(n.id, n);
    return m;
  }, [data]);

  // Build a lead-display map keyed by note so the card can render a rich
  // chip (name + kind) without a second fetch. We pull the same leads list
  // the editor uses, indexed by googleEventId/dealId.
  const { data: leadsData = [] } = useQuery<LeadRef[]>({
    queryKey: ["note-leads"],
    queryFn: async () => {
      const res = await fetch("/api/closer/notes/leads");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  const leadByKey = useMemo(() => {
    const map = new Map<string, LeadRef>();
    for (const lead of leadsData) {
      if (lead.googleEventId) map.set(`event:${lead.googleEventId}`, lead);
      if (lead.dealId) map.set(`deal:${lead.dealId}`, lead);
    }
    return map;
  }, [leadsData]);

  function leadRefFor(note: NoteRecord): LeadRef | null {
    return (
      (note.linkedGoogleEventId && leadByKey.get(`event:${note.linkedGoogleEventId}`)) ||
      (note.linkedDealId && leadByKey.get(`deal:${note.linkedDealId}`)) ||
      null
    );
  }

  function leadDisplayFor(note: NoteRecord): { label: string; kindLabel: string } | null {
    const ref = leadRefFor(note);
    if (!ref) {
      // Linked but context not in the leads pool anymore — still show a stub
      // so the setter knows this note is attached to something.
      if (note.linkedGoogleEventId || note.linkedDealId) {
        return { label: "Linked lead", kindLabel: "link" };
      }
      return null;
    }
    const kindLabel = ref.kind === "no_show" ? "no-show" : ref.kind;
    return { label: ref.label, kindLabel };
  }

  const leadLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    leadByKey.forEach((lead, key) => m.set(key, lead.label));
    return m;
  }, [leadByKey]);

  const grouped = useMemo(
    () => groupNotes(notes, groupMode, leadLabelByKey),
    [notes, groupMode, leadLabelByKey]
  );

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["closer-notes"] });
  }

  async function handleDelete(note: NoteRecord) {
    if (!confirm(`Delete "${note.title}"?`)) return;
    const res = await fetch(`/api/closer/notes/${note.id}`, { method: "DELETE" });
    if (res.ok) refetch();
  }

  async function handleArchiveToggle(note: NoteRecord, archived: boolean) {
    const res = await fetch(`/api/closer/notes/${note.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    if (res.ok) refetch();
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{heading}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your private scratchpad — prioritize tasks, tag context, attach a lead.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg ac-gradient text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            New note
          </button>
        </div>

        {/* Group-by pills */}
        <div className="flex items-center gap-2 flex-wrap mb-6">
          {([
            { v: "priority", l: "By priority" },
            { v: "due", l: "By due date" },
            { v: "tag", l: "By tag" },
            { v: "lead", l: "By lead" },
          ] as { v: GroupMode; l: string }[]).map((c) => (
            <button
              key={c.v}
              onClick={() => setGroupMode(c.v)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                groupMode === c.v
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              )}
            >
              {c.l}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/50 bg-card/50 p-12 text-center">
            <p className="text-sm text-muted-foreground">
              No notes yet. Click <span className="font-semibold text-foreground">+ New note</span> to start.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((g) => (
              <section key={g.key}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {g.label}
                  </h2>
                  <span className="text-xs text-muted-foreground">{g.notes.length}</span>
                </div>
                <div className="space-y-2">
                  {g.notes.map((n) => {
                    const display = leadDisplayFor(n);
                    const hasLink = n.linkedGoogleEventId || n.linkedDealId;
                    const isOwn = ownIds.has(n.id);
                    const shared = sharedById.get(n.id);
                    const own = ownById.get(n.id);
                    return (
                      <NoteCard
                        key={`${g.key}-${n.id}`}
                        note={n}
                        leadDisplay={display}
                        readOnly={!isOwn}
                        sharedByName={shared?.ownerName ?? null}
                        sharedWithCount={own?.sharedWith.length}
                        isArchived={false}
                        onArchiveToggle={!isOwn ? () => handleArchiveToggle(n, true) : undefined}
                        onEdit={() => isOwn && setEditingNote(own ?? null)}
                        onDelete={() => isOwn && handleDelete(n)}
                        onOpenLead={
                          hasLink
                            ? () =>
                                setViewingLead({
                                  googleEventId: n.linkedGoogleEventId,
                                  dealId: n.linkedDealId,
                                  label: display?.label ?? "Linked lead",
                                })
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Archived shares — collapsed by default */}
        {(data?.sharedArchived?.length ?? 0) > 0 && (
          <section className="mt-10">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              <Archive className="h-3 w-3" />
              Archived shared notes ({data?.sharedArchived.length ?? 0})
              <span className="text-muted-foreground opacity-60">{showArchived ? "(hide)" : "(show)"}</span>
            </button>
            {showArchived && (
              <div className="space-y-2 mt-3">
                {data?.sharedArchived.map((n) => {
                  const hasLink = n.linkedGoogleEventId || n.linkedDealId;
                  return (
                    <NoteCard
                      key={`archived-${n.id}`}
                      note={n}
                      readOnly
                      sharedByName={n.ownerName}
                      isArchived
                      onArchiveToggle={() => handleArchiveToggle(n, false)}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      onOpenLead={
                        hasLink
                          ? () =>
                              setViewingLead({
                                googleEventId: n.linkedGoogleEventId,
                                dealId: n.linkedDealId,
                                label: n.title,
                              })
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {(creating || editingNote) && (
          <NoteEditor
            note={editingNote}
            initialLeadLabel={editingNote ? leadRefFor(editingNote)?.label ?? null : null}
            initialLeadKind={editingNote ? leadRefFor(editingNote)?.kind ?? null : null}
            onClose={() => {
              setCreating(false);
              setEditingNote(null);
            }}
            onSaved={() => {
              setCreating(false);
              setEditingNote(null);
              refetch();
            }}
          />
        )}

        {viewingLead && (
          <LeadContextModal
            googleEventId={viewingLead.googleEventId}
            dealId={viewingLead.dealId}
            fallbackTitle={viewingLead.label}
            onClose={() => setViewingLead(null)}
          />
        )}
      </div>
    </main>
  );
}

// ── Grouping helpers ────────────────────────────────────────────────────

interface Group {
  key: string;
  label: string;
  notes: NoteRecord[];
}

function groupNotes(
  notes: NoteRecord[],
  mode: GroupMode,
  leadLabelByKey: Map<string, string>
): Group[] {
  switch (mode) {
    case "priority":
      return groupByPriority(notes);
    case "due":
      return groupByDue(notes);
    case "tag":
      return groupByTag(notes);
    case "lead":
      return groupByLead(notes, leadLabelByKey);
  }
}

function groupByPriority(notes: NoteRecord[]): Group[] {
  const buckets: Record<string, NoteRecord[]> = { high: [], medium: [], low: [] };
  for (const n of notes) {
    (buckets[n.priority] ?? buckets.medium).push(n);
  }
  return (["high", "medium", "low"] as const)
    .filter((p) => buckets[p].length > 0)
    .map((p) => ({
      key: p,
      label: p === "high" ? "High priority" : p === "medium" ? "Medium priority" : "Low priority",
      notes: buckets[p],
    }));
}

function parseDueDate(raw: string | null): Date | null {
  if (!raw) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    const dt = new Date(raw);
    return isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

function groupByDue(notes: NoteRecord[]): Group[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + 7);

  const buckets: Record<string, NoteRecord[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    none: [],
  };

  for (const n of notes) {
    const d = parseDueDate(n.dueDate);
    if (!d) buckets.none.push(n);
    else if (d < today) buckets.overdue.push(n);
    else if (d.getTime() === today.getTime()) buckets.today.push(n);
    else if (d <= endOfWeek) buckets.week.push(n);
    else buckets.later.push(n);
  }

  return [
    { key: "overdue", label: "Overdue", notes: buckets.overdue },
    { key: "today", label: "Due today", notes: buckets.today },
    { key: "week", label: "This week", notes: buckets.week },
    { key: "later", label: "Later", notes: buckets.later },
    { key: "none", label: "No due date", notes: buckets.none },
  ].filter((g) => g.notes.length > 0);
}

function groupByTag(notes: NoteRecord[]): Group[] {
  const byTag = new Map<string, NoteRecord[]>();
  const untagged: NoteRecord[] = [];
  for (const n of notes) {
    if (n.tags.length === 0) {
      untagged.push(n);
      continue;
    }
    for (const tag of n.tags) {
      const existing = byTag.get(tag) ?? [];
      existing.push(n);
      byTag.set(tag, existing);
    }
  }
  const groups = Array.from(byTag.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tag, ns]) => ({ key: `tag:${tag}`, label: `#${tag}`, notes: ns }));
  if (untagged.length > 0) {
    groups.push({ key: "untagged", label: "Untagged", notes: untagged });
  }
  return groups;
}

function groupByLead(notes: NoteRecord[], leadLabelByKey: Map<string, string>): Group[] {
  const byLead = new Map<string, NoteRecord[]>();
  const unlinked: NoteRecord[] = [];
  for (const n of notes) {
    const key = n.linkedGoogleEventId
      ? `event:${n.linkedGoogleEventId}`
      : n.linkedDealId
        ? `deal:${n.linkedDealId}`
        : null;
    if (!key) {
      unlinked.push(n);
      continue;
    }
    const existing = byLead.get(key) ?? [];
    existing.push(n);
    byLead.set(key, existing);
  }
  const groups = Array.from(byLead.entries())
    .map(([key, ns]) => ({
      key,
      // Prefer the real client name from the leads pool; fall back to a
      // stub when the lead is gone (setter unclaimed, deal deleted, etc.).
      label: leadLabelByKey.get(key) ?? "Linked lead",
      notes: ns,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (unlinked.length > 0) {
    groups.push({ key: "unlinked", label: "Unlinked", notes: unlinked });
  }
  return groups;
}
