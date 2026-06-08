"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  Printer,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveIcon } from "@/components/welcome-kit/icons";
import { IconPicker, Select, StringListEditor, TextArea, TextInput, Toggle } from "@/components/welcome-kit/builder/fields";
import { PreviewFrame } from "@/components/welcome-kit/builder/PreviewFrame";
import { SopRenderer } from "@/components/sop/SopRenderer";
import { SopBlockEditor } from "@/components/sop/builder/SopBlockEditor";
import {
  SOP_BLOCK_TYPES,
  SOP_BLOCK_TYPE_LABEL,
  newSopBlock,
  newSopSection,
  removeAt,
  replaceAt,
  sopBlockSummary,
} from "@/components/sop/builder/sopBlocks";
import type {
  SopBlock,
  SopBlockType,
  SopDoc,
  SopRecord,
  SopSection,
  SopStatus,
} from "@/lib/sop";

async function fetchRecord(id: string): Promise<SopRecord> {
  const res = await fetch(`/api/admin/sops/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).data as SopRecord;
}

type SaveVars = { doc: SopDoc; folder: string; tags: string[]; status: SopStatus; baseUpdatedAt: string | null };
type SaveResult = SopRecord;
type SaveError = Error & { conflict?: SopRecord };

/* ------------------------------------------------------------------ */
/*  Add-block menu                                                     */
/* ------------------------------------------------------------------ */

function AddBlockMenu({ onAdd }: { onAdd: (type: SopBlockType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add block
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute z-20 mt-1 w-[min(16rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-1 shadow-xl">
            {SOP_BLOCK_TYPES.map((b) => (
              <button
                key={b.type}
                type="button"
                onClick={() => {
                  onAdd(b.type);
                  setOpen(false);
                }}
                className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent transition-colors"
              >
                <span className="block text-sm font-semibold text-foreground">{b.label}</span>
                <span className="block text-[11px] text-muted-foreground">{b.hint}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable block                                                     */
/* ------------------------------------------------------------------ */

function SortableBlock({
  block,
  onChange,
  onRemove,
}: {
  block: SopBlock;
  onChange: (b: SopBlock) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("rounded-xl border border-border/70 bg-muted/30", isDragging && "opacity-50 z-10")}
    >
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag block"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 min-w-0 text-left">
          <span className="text-muted-foreground shrink-0">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            {SOP_BLOCK_TYPE_LABEL[block.type]}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{sopBlockSummary(block)}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
          aria-label="Delete block"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="border-t border-border/60 p-3">
          <SopBlockEditor block={block} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable section                                                   */
/* ------------------------------------------------------------------ */

function SortableSection({
  section,
  index,
  onChange,
  onRemove,
}: {
  section: SopSection;
  index: number;
  onChange: (s: SopSection) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const Icon = resolveIcon(section.icon);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const blocks = section.blocks;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleBlockDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = blocks.findIndex((b) => b.id === active.id);
    const newI = blocks.findIndex((b) => b.id === over.id);
    if (oldI === -1 || newI === -1) return;
    onChange({ ...section, blocks: arrayMove(blocks, oldI, newI) });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("rounded-xl border border-border/70 bg-card", isDragging && "opacity-60 z-10")}
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag section"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 min-w-0 text-left">
          <span className="text-muted-foreground shrink-0">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground truncate">
              {section.title || "Untitled section"}
            </span>
            <span className="block text-[11px] text-muted-foreground truncate">
              {section.num || `${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
          aria-label="Delete section"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="border-t border-border/60 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
            <IconPicker label="Icon" value={section.icon} onChange={(icon) => onChange({ ...section, icon })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextInput
                label="Eyebrow"
                value={section.num}
                onChange={(num) => onChange({ ...section, num })}
                placeholder="01 / Purpose"
              />
              <TextInput
                label="Heading"
                value={section.title}
                onChange={(title) => onChange({ ...section, title })}
                placeholder="Purpose & Scope"
              />
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBlockDragEnd}>
              <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {blocks.map((block, i) => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      onChange={(b) => onChange({ ...section, blocks: replaceAt(blocks, i, b) })}
                      onRemove={() => onChange({ ...section, blocks: removeAt(blocks, i) })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {blocks.length === 0 && (
              <p className="text-xs text-muted-foreground italic px-1">No blocks yet — add one below.</p>
            )}

            <AddBlockMenu onAdd={(type) => onChange({ ...section, blocks: [...blocks, newSopBlock(type)] })} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main builder                                                       */
/* ------------------------------------------------------------------ */

export function SopBuilder({
  sopId,
  folderNames,
  onBack,
  onSaved,
}: {
  sopId: string;
  folderNames: string[];
  onBack: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sop", sopId],
    queryFn: () => fetchRecord(sopId),
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<SopDoc | null>(null);
  const [folder, setFolder] = useState("General");
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<SopStatus>("draft");
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [conflict, setConflict] = useState<SopRecord | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [justSaved, setJustSaved] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfMsg, setPdfMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (data && draft === null) {
      setDraft(data.doc);
      setFolder(data.folder);
      setTags(data.tags);
      setStatus(data.status);
      setBaseUpdatedAt(data.updatedAt);
      setSavedJson(JSON.stringify({ doc: data.doc, folder: data.folder, tags: data.tags, status: data.status }));
    }
  }, [data, draft]);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const dirty = useMemo(
    () => draft !== null && JSON.stringify({ doc: draft, folder, tags, status }) !== savedJson,
    [draft, folder, tags, status, savedJson]
  );

  const saveMutation = useMutation<SaveResult, SaveError, SaveVars>({
    mutationFn: async (vars) => {
      const res = await fetch(`/api/admin/sops/${sopId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (res.status === 409) {
        const json = await res.json().catch(() => null);
        const err = new Error("conflict") as SaveError;
        err.conflict = json?.data as SopRecord | undefined;
        throw err;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).data as SaveResult;
    },
    onSuccess: (result) => {
      setDraft(result.doc);
      setFolder(result.folder);
      setTags(result.tags);
      setStatus(result.status);
      setBaseUpdatedAt(result.updatedAt);
      setSavedJson(JSON.stringify({ doc: result.doc, folder: result.folder, tags: result.tags, status: result.status }));
      setConflict(null);
      setSaveErr("");
      setJustSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["sops"] });
      queryClient.invalidateQueries({ queryKey: ["sop", sopId] });
      onSaved();
    },
    onError: (err) => {
      if (err.conflict) { setConflict(err.conflict); return; }
      const code = Number(/HTTP (\d+)/.exec(err.message || "")?.[1] ?? 0);
      setSaveErr(
        code === 401 || code === 403
          ? "Your session expired — please log in again, then retry."
          : "Couldn't save. Please try again."
      );
    },
  });

  function save(overrideBase?: string | null) {
    if (!draft) return;
    setSaveErr("");
    saveMutation.mutate({ doc: draft, folder, tags, status, baseUpdatedAt: overrideBase ?? baseUpdatedAt });
  }

  function loadTheirVersion() {
    if (!conflict) return;
    setDraft(conflict.doc);
    setFolder(conflict.folder);
    setTags(conflict.tags);
    setStatus(conflict.status);
    setBaseUpdatedAt(conflict.updatedAt);
    setSavedJson(JSON.stringify({ doc: conflict.doc, folder: conflict.folder, tags: conflict.tags, status: conflict.status }));
    setConflict(null);
  }

  // Export to PDF via the browser's print engine (matches the canvas exactly).
  // Saves current edits first so the print view reflects them.
  async function openPrint() {
    if (!draft) return;
    setPdfMsg("");
    // Open the tab synchronously inside the click gesture so popup blockers
    // don't block it after the (async) save of unsaved edits.
    const w = window.open("", "_blank");
    setDownloading(true);
    try {
      if (dirty) {
        await saveMutation.mutateAsync({ doc: draft, folder, tags, status, baseUpdatedAt });
      }
      const url = `/sop-print/${sopId}`;
      if (w) w.location.href = url;
      else window.open(url, "_blank");
    } catch {
      // save failed (conflict / session) — the conflict banner / save error already shows
      if (w) w.close();
      setPdfMsg("Couldn't save your changes — resolve that first, then export to PDF.");
    } finally {
      setDownloading(false);
    }
  }

  function handleSectionDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id || !draft) return;
    const oldI = draft.sections.findIndex((s) => s.id === active.id);
    const newI = draft.sections.findIndex((s) => s.id === over.id);
    if (oldI === -1 || newI === -1) return;
    setDraft({ ...draft, sections: arrayMove(draft.sections, oldI, newI) });
  }

  if (isLoading || draft === null) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-8">
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-600">
        Failed to load this SOP. Please go back and try again.
      </div>
    );
  }

  const sections = draft.sections;
  const folderOptions = Array.from(new Set([folder, "General", ...folderNames])).map((f) => ({ value: f, label: f }));
  const statusText = saveMutation.isPending
    ? "Saving…"
    : justSaved
      ? "Saved"
      : dirty
        ? "Unsaved changes"
        : "All changes saved";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Library
          </button>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-sm font-medium",
              saveMutation.isPending ? "text-muted-foreground" : justSaved ? "text-emerald-600" : dirty ? "text-amber-600" : "text-muted-foreground"
            )}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : justSaved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <span className={cn("h-2 w-2 rounded-full", dirty ? "bg-amber-500" : "bg-emerald-500")} />
            )}
            {statusText}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mobile edit/preview switch */}
          <div className="flex bg-muted rounded-lg p-1 xl:hidden">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors", mode === "edit" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors", mode === "preview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          </div>

          <button
            type="button"
            onClick={openPrint}
            disabled={downloading}
            title="Export to PDF (matches this preview)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
            PDF
          </button>
          <button
            type="button"
            onClick={() => save()}
            disabled={!dirty || saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>

      {pdfMsg && <p className="text-xs text-muted-foreground">{pdfMsg}</p>}
      {saveErr && <p className="text-xs text-destructive">{saveErr}</p>}

      {/* Conflict banner */}
      {conflict && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Someone else saved changes</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                This SOP was updated after you opened it. Load their version, or overwrite it with yours.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadTheirVersion}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
                >
                  Load their version
                </button>
                <button
                  type="button"
                  onClick={() => save(conflict.updatedAt)}
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white ac-gradient hover:opacity-90 transition-all disabled:opacity-40"
                >
                  {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Overwrite with mine
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editor + Preview */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Editor */}
        <div className={cn("min-w-0 space-y-3", mode === "preview" && "hidden xl:block")}>
          {/* SOP settings */}
          <div className="rounded-xl border border-border/70 bg-card p-3 space-y-3">
            <TextInput
              label="Title"
              value={draft.title}
              onChange={(title) => setDraft({ ...draft, title })}
              placeholder="Inbound Lead Intake SOP"
            />
            <TextArea
              label="Summary"
              value={draft.summary}
              onChange={(summary) => setDraft({ ...draft, summary })}
              placeholder="One or two sentences describing this SOP."
              rows={2}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label="Folder / Department" value={folder} onChange={setFolder} options={folderOptions} />
              <div className="flex items-end">
                <Toggle
                  label={status === "published" ? "Published" : "Draft"}
                  checked={status === "published"}
                  onChange={(v) => setStatus(v ? "published" : "draft")}
                />
              </div>
            </div>
            <StringListEditor label="Tags" items={tags} onChange={setTags} placeholder="tag" addLabel="Add tag" />
          </div>

          {/* Sections */}
          <div className="space-y-2">
            <div className="px-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sections</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Each text box has formatting buttons — bold, heading, lists, links — or type Markdown directly.
              </p>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
              <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {sections.map((section, i) => (
                    <SortableSection
                      key={section.id}
                      section={section}
                      index={i}
                      onChange={(s) => setDraft({ ...draft, sections: replaceAt(sections, i, s) })}
                      onRemove={() => setDraft({ ...draft, sections: removeAt(sections, i) })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, sections: [...sections, newSopSection(sections.length)] })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add section
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className={cn("min-w-0", mode === "edit" && "hidden xl:block")}>
          <div className="xl:sticky xl:top-6">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Live canvas</p>
              <div className="flex bg-muted rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setDevice("desktop")}
                  aria-label="Desktop preview"
                  className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors", device === "desktop" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setDevice("mobile")}
                  aria-label="Mobile preview"
                  className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors", device === "mobile" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile
                </button>
              </div>
            </div>

            {device === "mobile" ? (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 md:p-4 max-h-[calc(100vh-9rem)] overflow-auto">
                <div className="mx-auto w-fit overflow-hidden rounded-[2rem] border-4 border-foreground/10 bg-background shadow-lg">
                  <div className="h-[680px] w-[390px]">
                    <PreviewFrame width={390}>
                      <div className="bg-background p-3">
                        <SopRenderer doc={draft} />
                      </div>
                    </PreviewFrame>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-background p-3 md:p-4 max-h-[calc(100vh-9rem)] overflow-y-auto">
                <div className="pointer-events-none">
                  <SopRenderer doc={draft} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
