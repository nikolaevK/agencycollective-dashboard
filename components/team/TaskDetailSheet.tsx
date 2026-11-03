"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  AtSign,
  FileText,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  Send,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, BadgeDot, StatusBadge, badgeTone, badgeToneHover } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/use-confirm";
import { formatDate } from "@/components/users/format";
import { ReassignTaskDialog } from "./ReassignTaskDialog";
import { PriorityFlag } from "./TeamBits";
import { useTeamMemberOptions, type TaskMutations } from "./useTeamData";
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  SOURCE_META,
} from "./presentation";
import type {
  MemberHubPayload,
  TeamTaskRecord,
  TeamTaskComment,
  TeamTaskTag,
  TeamTaskDocument,
  TaskChecklistItem,
} from "./types";

/**
 * A due date worth saving: the server accepts 2000–2099 only
 * (isValidTeamDueYmd), so anything outside 20xx is not a date to send.
 */
const SAVABLE_DUE_RE = /^20\d\d-\d\d-\d\d$/;

/** Radix Select values can't be "" — the "No client" option's stand-in. */
const NO_CLIENT = "__none__";

/** Hover-revealed row actions: always visible on touch (no hover there). */
const ROW_ACTION_CLS =
  "shrink-0 rounded-full opacity-60 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-2.5 -m-1.5 text-muted-foreground hover:text-destructive";

/** Slide-over task detail: status/priority/due/client/lineup, checklist, comments. */
export function TaskDetailSheet({
  task: t,
  hub,
  today,
  mutations,
  onClose,
}: {
  task: TeamTaskRecord;
  hub: MemberHubPayload;
  today: string;
  mutations: TaskMutations;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data: memberOptions = [] } = useTeamMemberOptions();
  const [title, setTitle] = useState(t.title);
  const [description, setDescription] = useState(t.description);
  const [dueDraft, setDueDraft] = useState(t.dueDate ?? "");
  const [newItem, setNewItem] = useState("");
  const [comment, setComment] = useState("");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Text fields save only what the user actually typed. While untouched they
  // follow the server copy, so an agent/teammate edit that lands while the
  // sheet is open is shown — and never overwritten by a focus+blur.
  const titleDirty = useRef(false);
  const descriptionDirty = useRef(false);
  useEffect(() => {
    if (!titleDirty.current) setTitle(t.title);
  }, [t.title]);
  useEffect(() => {
    if (!descriptionDirty.current) setDescription(t.description);
  }, [t.description]);
  useEffect(() => {
    setDueDraft(t.dueDate ?? "");
  }, [t.dueDate]);

  // Focus moves into the sheet on open and back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, []);

  // Picking a new assignee opens the confirm dialog, where extra members can
  // be checked to TAG (multi-recipient reassign: single owner + tags) and a
  // handoff note added.
  const [reassignTargetId, setReassignTargetId] = useState<string | null>(null);
  const [reassignBusy, setReassignBusy] = useState(false);
  const reassignTarget = reassignTargetId
    ? memberOptions.find((m) => m.adminId === reassignTargetId) ?? null
    : null;

  function confirmReassign(alsoTag: string[], note: string) {
    if (!reassignTarget) return;
    setReassignBusy(true);
    mutations
      .reassignTask(
        t.id,
        reassignTarget.adminId,
        note || undefined,
        alsoTag.length > 0 ? alsoTag : undefined
      )
      .then(onClose) // the task no longer belongs to this hub
      .catch((err) => {
        // Keep the dialog open — a failed transfer must not eat the typed
        // note and checked tags; the user can retry or cancel.
        alert(err instanceof Error ? err.message : String(err));
        setReassignBusy(false);
      });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A Radix popup (select, date picker, confirm) consumed this Escape to
      // close itself — it must not also tear down the sheet.
      if (e.defaultPrevented) return;
      if (e.key !== "Escape") return;
      // Escape inside an editor cancels the field (blur fires the pending
      // save) instead of tearing down the sheet mid-edit.
      // Kit pickers (Select = role combobox, DatePicker = a popup trigger)
      // count as fields too, like the native selects/date inputs did.
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.getAttribute("role") === "combobox" ||
          el.hasAttribute("aria-haspopup"))
      ) {
        el.blur();
        return;
      }
      // The reassign dialog sits on top: Escape cancels only that (never
      // mid-request), keeping the sheet and its edits.
      if (reassignTargetId) {
        if (!reassignBusy) setReassignTargetId(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, reassignTargetId, reassignBusy]);

  const { data: comments = [] } = useQuery<TeamTaskComment[]>({
    queryKey: ["team-task-comments", t.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/team/tasks/${t.id}/comments`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      return json.data.comments as TeamTaskComment[];
    },
    staleTime: 15_000,
  });

  const { data: tags = [] } = useQuery<TeamTaskTag[]>({
    queryKey: ["team-task-tags", t.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/team/tasks/${t.id}/tags`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      return json.data.tags as TeamTaskTag[];
    },
    staleTime: 15_000,
  });
  // Roster members who can still be tagged (never the assignee).
  const taggable = memberOptions.filter(
    (m) => m.adminId !== hub.member.adminId && !tags.some((tag) => tag.adminId === m.adminId)
  );

  const { data: documents = [] } = useQuery<TeamTaskDocument[]>({
    queryKey: ["team-task-documents", t.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/team/tasks/${t.id}/documents`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      return json.data.documents as TeamTaskDocument[];
    },
    staleTime: 15_000,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Tag/comment/attachment writes refresh the trail too (activity rows).
  const refreshTrail = () => {
    queryClient.invalidateQueries({ queryKey: ["team-task-comments", t.id] });
  };

  async function tagMember(adminId: string) {
    let res: Response;
    try {
      res = await fetch(`/api/admin/team/tasks/${t.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId }),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      return;
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      alert(json?.error ?? `HTTP ${res.status}`);
      return;
    }
    queryClient.setQueryData(["team-task-tags", t.id], json.data.tags);
    queryClient.invalidateQueries({ queryKey: ["team-tagged-tasks", adminId] });
    refreshTrail();
  }

  async function untagMember(adminId: string) {
    let res: Response;
    try {
      res = await fetch(`/api/admin/team/tasks/${t.id}/tags/${adminId}`, {
        method: "DELETE",
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      alert(json?.error ?? `HTTP ${res.status}`);
      return;
    }
    queryClient.setQueryData<TeamTaskTag[]>(["team-task-tags", t.id], (prev) =>
      (prev ?? []).filter((tag) => tag.adminId !== adminId)
    );
    queryClient.invalidateQueries({ queryKey: ["team-tagged-tasks", adminId] });
    refreshTrail();
  }

  async function uploadDocument(file: File) {
    if (file.type && file.type !== "application/pdf") {
      alert("Only PDF files can be attached");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("File too large (max 10 MB)");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/team/tasks/${t.id}/documents`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(json?.error ?? `HTTP ${res.status}`);
        return;
      }
      queryClient.setQueryData<TeamTaskDocument[]>(["team-task-documents", t.id], (prev) => [
        ...(prev ?? []),
        json.data as TeamTaskDocument,
      ]);
      refreshTrail();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function removeDocument(doc: TeamTaskDocument) {
    if (
      !(await confirm({
        title: `Remove attachment "${doc.fileName}"?`,
        confirmText: "Remove",
        destructive: true,
      }))
    )
      return;
    let res: Response;
    try {
      res = await fetch(`/api/admin/team/tasks/${t.id}/documents/${doc.id}`, {
        method: "DELETE",
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      alert(json?.error ?? `HTTP ${res.status}`);
      return;
    }
    queryClient.setQueryData<TeamTaskDocument[]>(["team-task-documents", t.id], (prev) =>
      (prev ?? []).filter((d) => d.id !== doc.id)
    );
    refreshTrail();
  }

  const patch = (changes: Record<string, unknown>) =>
    mutations
      .patchTask(t.id, changes)
      .catch((err) => alert(err instanceof Error ? err.message : String(err)));

  // A failed due-date save snaps the input back to the server value (the
  // [t.dueDate] sync effect won't fire — the server copy never changed).
  const patchDue = (dueDate: string | null) =>
    mutations.patchTask(t.id, { dueDate }).catch((err) => {
      setDueDraft(t.dueDate ?? "");
      alert(err instanceof Error ? err.message : String(err));
    });

  const overdue = t.status !== "complete" && !!t.dueDate && t.dueDate < today;
  const statusIdx = TASK_STATUS_ORDER.indexOf(t.status);
  const nextStatus = TASK_STATUS_ORDER[(statusIdx + 1) % TASK_STATUS_ORDER.length];
  const statusTone = TASK_STATUS_META[t.status].tone;
  const ckDone = t.checklist.filter((c) => c.done).length;
  const SourceIcon =
    t.source === "manual" ? null : t.source === "system" ? SOURCE_META.system.icon : Zap;

  function setChecklist(next: TaskChecklistItem[]) {
    patch({ checklist: next });
  }

  const toggleItem = (id: string) =>
    setChecklist(t.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));

  async function submitComment() {
    const body = comment.trim();
    if (!body) return;
    setComment("");
    // A failed post puts the text back (unless a new draft was started).
    const restore = () => setComment((prev) => prev || body);
    let res: Response;
    try {
      res = await fetch(`/api/admin/team/tasks/${t.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
    } catch (err) {
      restore();
      alert(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      restore();
      alert(json?.error ?? `HTTP ${res.status}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["team-task-comments", t.id] });
  }

  return (
    // Bottom sheet on phones (dvh = the visible viewport, unlike iOS vh);
    // centered card from sm up.
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={dialogOverlayClass} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          dialogPanelClass,
          "relative z-50 w-full max-w-xl max-h-[92dvh] sm:max-h-[88dvh] overflow-y-auto overscroll-contain rounded-b-none sm:rounded-4xl focus:outline-none"
        )}
      >
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-4xl border-b bg-popover px-5 py-3">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            Team / <span className="font-medium text-foreground">{hub.member.name}</span> / Tasks
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => patch({ lineup: !t.lineup })}
              className={cn(t.lineup ? "bg-muted text-foreground" : "text-muted-foreground")}
              title={t.lineup ? "Unpin from Lineup" : "Pin to Lineup"}
            >
              {t.lineup ? <Pin /> : <PinOff />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={async () => {
                if (
                  await confirm({
                    title: "Delete this task?",
                    confirmText: "Delete",
                    destructive: true,
                  })
                ) {
                  mutations
                    .removeTask(t.id)
                    .then(onClose)
                    .catch((err) => alert(err instanceof Error ? err.message : String(err)));
                }
              }}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete task"
            >
              <Trash2 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="text-muted-foreground"
              aria-label="Close"
            >
              <X />
            </Button>
          </div>
        </div>

        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-5">
          {/* Status + priority controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => patch({ status: nextStatus })}
                className={cn("gap-1.5 rounded-r-none", badgeTone[statusTone], badgeToneHover[statusTone])}
                title={`Advance to ${TASK_STATUS_META[nextStatus].label}`}
              >
                <BadgeDot tone={statusTone} />
                {TASK_STATUS_META[t.status].label}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => patch({ status: nextStatus })}
                className={cn("-ml-px rounded-l-none", badgeTone[statusTone], badgeToneHover[statusTone])}
                aria-label="Advance status"
              >
                <ArrowRight />
              </Button>
            </span>
            <Select value={t.priority} onValueChange={(v) => patch({ priority: v })}>
              <SelectTrigger className="h-8 w-auto min-w-32" aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITY_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className="inline-flex items-center gap-2">
                      <PriorityFlag priority={p} />
                      {TASK_PRIORITY_META[p].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
          </div>

          {/* Title — auto-growing textarea so long titles wrap on phones
              instead of hiding past the single-line input's edge. Enter
              commits (blur) rather than inserting a newline. */}
          <textarea
            id={titleId}
            rows={1}
            value={title}
            onChange={(e) => {
              titleDirty.current = true;
              setTitle(e.target.value.replace(/\n/g, " "));
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onBlur={() => {
              if (!titleDirty.current) return;
              titleDirty.current = false;
              const trimmed = title.trim();
              if (trimmed && trimmed !== t.title) patch({ title: trimmed });
              else setTitle(t.title); // cleared or unchanged — revert, never save blank
            }}
            className="w-full resize-none overflow-hidden bg-transparent text-lg font-semibold leading-snug tracking-tight text-foreground focus:outline-none border-b border-transparent focus:border-border pb-1"
            aria-label="Task title"
          />

          {/* Fields */}
          <div className="grid grid-cols-[84px_minmax(0,1fr)] sm:grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-3 items-center text-sm">
            <span className="text-xs text-muted-foreground">Assignee</span>
            {/* Controlled by the hub owner — a declined confirm or failed
                reassign simply re-renders back to the current assignee.
                Only true SWEEP tasks (created_by='system') are locked —
                agent-created tasks with a 'system' source label reassign fine. */}
            <Select
              value={hub.member.adminId}
              onValueChange={(v) => {
                if (v && v !== hub.member.adminId) setReassignTargetId(v);
              }}
              disabled={t.source === "system" && t.createdBy === "system"}
            >
              <SelectTrigger
                className="h-8 w-56 max-w-full"
                aria-label="Assignee"
                title={
                  t.source === "system" && t.createdBy === "system"
                    ? "Sweep-generated tasks can't be reassigned — the sweep routes them per member"
                    : "Reassigning moves this task (and its linked action item) to the selected member's hub"
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!memberOptions.some((m) => m.adminId === hub.member.adminId) && (
                  <SelectItem value={hub.member.adminId}>{hub.member.name}</SelectItem>
                )}
                {memberOptions.map((m) => (
                  <SelectItem key={m.adminId} value={m.adminId}>
                    {m.name}
                    {m.position ? ` — ${m.position}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Due date</span>
            {/* The picker hands over a whole date (or "" from Clear) in one
                go — no typed partials, no blur step — so the native input's
                change + blur rules run together: a 20xx date saves at once,
                clearing saves null, anything else snaps back to the server
                value. Never one PATCH per keystroke. */}
            <DatePicker
              value={dueDraft}
              onValueChange={(v) => {
                setDueDraft(v);
                if (v === "") {
                  if (t.dueDate) patchDue(null);
                } else if (!SAVABLE_DUE_RE.test(v)) {
                  setDueDraft(t.dueDate ?? "");
                } else if (v !== t.dueDate) {
                  patchDue(v);
                }
              }}
              placeholder="No due date"
              className={cn("h-8 w-44", overdue && "font-medium text-red-700 dark:text-red-400")}
              aria-label="Due date"
            />
            <span className="text-xs text-muted-foreground">Client</span>
            <Select
              value={t.clientId || NO_CLIENT}
              onValueChange={(v) => patch({ clientId: v === NO_CLIENT ? null : v })}
            >
              <SelectTrigger className="h-8 w-56 max-w-full" aria-label="Client">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLIENT}>No client</SelectItem>
                {/* A task forwarded from another book can carry a client this
                    hub doesn't manage — keep it selected rather than "No client". */}
                {t.clientId && !hub.clients.some((c) => c.id === t.clientId) && (
                  <SelectItem value={t.clientId}>Client outside this hub</SelectItem>
                )}
                {hub.clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Tagged</span>
            {/* Tagged teammates see this task in their hub's Tagged section. */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {tags.map((tag) => (
                // overflow-visible: the untag button's hit area reaches past
                // the badge's edge.
                <Badge
                  key={tag.adminId}
                  variant="outline"
                  className="max-w-full overflow-visible pr-1 font-normal"
                  title={tag.taggedByName ? `Tagged by ${tag.taggedByName}` : undefined}
                >
                  <AtSign className="text-muted-foreground" />
                  <span className="min-w-0 truncate">{tag.name}</span>
                  <button
                    type="button"
                    onClick={() => untagMember(tag.adminId)}
                    className="-m-2 rounded-full p-2.5 text-muted-foreground hover:text-destructive"
                    aria-label={`Untag ${tag.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {/* Always empty: picking a member tags them and the picker
                  resets to its placeholder. Disabled when nobody is left to
                  tag (a Radix Select would open an empty menu). */}
              <Select value="" onValueChange={(v) => v && tagMember(v)} disabled={taggable.length === 0}>
                <SelectTrigger
                  className="h-7 w-40 max-w-full px-2.5 text-xs"
                  aria-label="Tag a teammate"
                  title="The tagged member sees this task in their hub's Tagged section"
                >
                  <SelectValue placeholder="Tag teammate…" />
                </SelectTrigger>
                <SelectContent>
                  {taggable.map((m) => (
                    <SelectItem key={m.adminId} value={m.adminId}>
                      {m.name}
                      {m.position ? ` — ${m.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground">Source</span>
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
              <Badge variant="outline" className="font-normal">
                {SourceIcon && <SourceIcon className="text-muted-foreground" />}
                {t.source === "manual"
                  ? "Manual"
                  : t.source === "system"
                    ? SOURCE_META.system.label
                    : "Action item"}
              </Badge>
              {t.createdByName && (
                <span className="text-muted-foreground">· by {t.createdByName}</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">Created</span>
            <span className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</span>
          </div>

          {/* Description */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Description</p>
            <Textarea
              value={description}
              onChange={(e) => {
                descriptionDirty.current = true;
                setDescription(e.target.value);
              }}
              onBlur={() => {
                if (!descriptionDirty.current) return;
                descriptionDirty.current = false;
                if (description !== t.description) patch({ description });
              }}
              placeholder="Add description…"
              rows={3}
              className="resize-y leading-relaxed"
            />
          </div>

          {/* Checklist */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Checklist{" "}
              {t.checklist.length > 0 && (
                <span className="tabular-nums">
                  {ckDone}/{t.checklist.length}
                </span>
              )}
            </p>
            <div className="space-y-1">
              {t.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 py-1 group">
                  <Checkbox
                    checked={item.done}
                    onCheckedChange={() => toggleItem(item.id)}
                    // Radix toggles on Space only; the old button took Enter too.
                    onKeyDown={(e) => {
                      if (e.key === "Enter") toggleItem(item.id);
                    }}
                    aria-label={item.done ? "Uncheck" : "Check"}
                  />
                  <span
                    className={cn(
                      "flex-1 min-w-0 break-words text-sm",
                      item.done ? "text-muted-foreground line-through" : "text-foreground"
                    )}
                  >
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setChecklist(t.checklist.filter((c) => c.id !== item.id))
                    }
                    className={ROW_ACTION_CLS}
                    aria-label="Remove item"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2.5 pt-1">
                <Plus className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  type="text"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newItem.trim()) {
                      setChecklist([
                        ...t.checklist,
                        { id: crypto.randomUUID(), text: newItem.trim(), done: false },
                      ]);
                      setNewItem("");
                    }
                  }}
                  placeholder="Add checklist item…"
                  className="h-8"
                />
              </div>
            </div>
          </div>

          {/* Attachments — PDF BLOBs ≤10 MB, served by the documents route */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Attachments{" "}
              {documents.length > 0 && <span className="tabular-nums">{documents.length}</span>}
            </p>
            <div className="space-y-1.5">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2.5 rounded-2xl bg-muted/40 px-3 py-2 group text-xs"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  {/* Phones: uploader/date stack under the filename instead of
                      crushing it; side by side from sm. */}
                  <span className="flex-1 min-w-0 sm:flex sm:items-center sm:gap-2">
                    <a
                      href={`/api/admin/team/tasks/${t.id}/documents/${doc.id}?view=1`}
                      target="_blank"
                      rel="noreferrer"
                      className="block min-w-0 truncate text-sm font-medium text-foreground hover:underline sm:flex-1"
                      title={`${doc.fileName} · ${(doc.fileSize / 1024 / 1024).toFixed(1)} MB`}
                    >
                      {doc.fileName}
                    </a>
                    <span className="block truncate text-muted-foreground sm:shrink-0">
                      {doc.uploadedByName ? `${doc.uploadedByName} · ` : ""}
                      {formatDate(doc.createdAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDocument(doc)}
                    className={ROW_ACTION_CLS}
                    aria-label={`Remove ${doc.fileName}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // allow re-selecting the same file
                  if (file) uploadDocument(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Paperclip />
                {uploading ? "Uploading…" : "Attach PDF (max 10 MB)"}
              </Button>
            </div>
          </div>

          {/* Activity & comments — one chronological trail */}
          <div className="border-t pt-4">
            <p className="mb-3 text-xs font-medium text-muted-foreground">Activity</p>
            <div className="space-y-2">
              {comments.map((c) =>
                c.kind === "activity" ? (
                  <p key={c.id} className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    <span className="min-w-0 break-words">
                      {c.body}
                      <span className="opacity-70">
                        {" "}
                        — {c.authorName || "System"} · {formatDate(c.createdAt)}
                      </span>
                    </span>
                  </p>
                ) : (
                  <div key={c.id} className="rounded-2xl bg-muted/40 px-3 py-2">
                    <p className="text-xs">
                      <span className="font-medium text-foreground">{c.authorName || "Unknown"}</span>{" "}
                      <span className="text-muted-foreground">· {formatDate(c.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-foreground whitespace-pre-wrap break-words">
                      {c.body}
                    </p>
                  </div>
                )
              )}
              {/* Pinned to the sheet's bottom so a long trail never pushes
                  the composer out of reach. */}
              <div className="sticky bottom-0 -mx-5 flex items-center gap-2 bg-popover px-5 py-2">
                <Input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitComment();
                  }}
                  placeholder="Write a comment… Enter to send"
                  aria-label="Write a comment"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={() => submitComment()}
                  aria-label="Send comment"
                >
                  <Send />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {reassignTarget && (
        <ReassignTaskDialog
          task={t}
          currentAdminId={hub.member.adminId}
          target={reassignTarget}
          memberOptions={memberOptions}
          busy={reassignBusy}
          onConfirm={confirmReassign}
          onCancel={() => setReassignTargetId(null)}
        />
      )}
      {confirmDialog}
    </div>
  );
}
