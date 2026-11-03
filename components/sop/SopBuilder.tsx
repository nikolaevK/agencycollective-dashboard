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
import { Badge, BadgeDot, badgeTone, badgeVariants, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="border-dashed text-muted-foreground">
          <Plus />
          Add block
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(16rem,calc(100vw-2rem))]">
        {SOP_BLOCK_TYPES.map((b) => (
          <DropdownMenuItem key={b.type} onSelect={() => onAdd(b.type)} className="flex-col items-start gap-0.5">
            <span className="block text-sm font-medium text-foreground">{b.label}</span>
            <span className="block text-xs font-normal text-muted-foreground">{b.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Ghost icon button tinted red on hover — the remove control. */
const removeBtnCls = "shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20";
/** The drag handle (dnd-kit listeners + keyboard attributes go on it). */
const gripCls =
  "flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 active:cursor-grabbing";
/** The collapse toggle that fills the header row. */
const toggleCls =
  "flex min-w-0 flex-1 items-center gap-2 rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

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
      className={cn("relative rounded-2xl bg-muted/50", isDragging && "z-10 opacity-50")}
    >
      <div className="flex items-center gap-1.5 p-2">
        <button type="button" className={gripCls} aria-label="Drag block" {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={toggleCls}>
          <span className="shrink-0 text-muted-foreground">
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </span>
          <span className={cn(badgeVariants({ variant: "outline" }), "shrink-0")}>
            {SOP_BLOCK_TYPE_LABEL[block.type]}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{sopBlockSummary(block)}</span>
        </button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} className={removeBtnCls} aria-label="Delete block" title="Delete block">
          <Trash2 />
        </Button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-foreground/5 p-3 dark:border-foreground/10">
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
    <Card
      ref={setNodeRef}
      style={style}
      className={cn("relative", isDragging && "z-10 opacity-60")}
    >
      <div className="flex items-center gap-1.5 p-3">
        <button type="button" className={gripCls} aria-label="Drag section" {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={toggleCls}>
          <span className="shrink-0 text-muted-foreground">
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </span>
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {section.title || "Untitled section"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {section.num || `${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
            </span>
          </span>
        </button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} className={removeBtnCls} aria-label="Delete section" title="Delete section">
          <Trash2 />
        </Button>
      </div>

      {open && (
        <div className="space-y-3 border-t p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
            <IconPicker label="Icon" value={section.icon} onChange={(icon) => onChange({ ...section, icon })} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <p className="px-1 text-xs italic text-muted-foreground">No blocks yet — add one below.</p>
            )}

            <AddBlockMenu onAdd={(type) => onChange({ ...section, blocks: [...blocks, newSopBlock(type)] })} />
          </div>
        </div>
      )}
    </Card>
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

  // A failed first load must surface (the skeleton below waits for a draft).
  if (isError && draft === null) {
    return (
      <QueryErrorState
        title="Failed to load this SOP."
        message="Please go back and try again."
      />
    );
  }

  if (isLoading || draft === null) {
    return (
      <Card className="p-6 md:p-8">
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
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
  const statusTone: BadgeTone = saveMutation.isPending ? "neutral" : justSaved ? "success" : dirty ? "warning" : "neutral";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft />
            Library
          </Button>
          <Badge
            variant="outline"
            tone={statusTone}
            role="status"
            className={cn("gap-1.5", statusTone === "neutral" && "text-muted-foreground")}
          >
            {saveMutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : justSaved ? (
              <Check />
            ) : (
              <BadgeDot tone={dirty ? "warning" : "success"} />
            )}
            {statusText}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mobile edit/preview switch */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as "edit" | "preview")} className="xl:hidden">
            <TabsList>
              <TabsTrigger value="edit">
                <Pencil />
                Edit
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Eye />
                Preview
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            type="button"
            variant="outline"
            onClick={openPrint}
            disabled={downloading}
            title="Export to PDF (matches this preview)"
          >
            {downloading ? <Loader2 className="animate-spin" /> : <Printer />}
            PDF
          </Button>
          <Button type="button" onClick={() => save()} disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save
          </Button>
        </div>
      </div>

      {pdfMsg && <p className="text-xs text-muted-foreground">{pdfMsg}</p>}
      {saveErr && <p role="alert" className="text-xs text-destructive">{saveErr}</p>}

      {/* Conflict banner */}
      {conflict && (
        <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.warning)}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Someone else saved changes</p>
              <p className="mt-0.5 text-xs opacity-90">
                This SOP was updated after you opened it. Load their version, or overwrite it with yours.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={loadTheirVersion} className="text-foreground">
                  Load their version
                </Button>
                <Button type="button" size="sm" onClick={() => save(conflict.updatedAt)} disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="animate-spin" />}
                  Overwrite with mine
                </Button>
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
          <Card className="space-y-3 p-4">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </Card>

          {/* Sections */}
          <div className="space-y-2">
            <div className="px-1">
              <p className="text-sm font-medium text-foreground">Sections</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDraft({ ...draft, sections: [...sections, newSopSection(sections.length)] })}
              className="border-dashed text-muted-foreground"
            >
              <Plus />
              Add section
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className={cn("min-w-0", mode === "edit" && "hidden xl:block")}>
          <div className="xl:sticky xl:top-6">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-sm font-medium text-foreground">Live canvas</p>
              <Tabs value={device} onValueChange={(v) => setDevice(v as "desktop" | "mobile")}>
                <TabsList className="h-8">
                  <TabsTrigger value="desktop" aria-label="Desktop preview" className="px-2.5 text-xs">
                    <Monitor className="size-3.5" />
                    Desktop
                  </TabsTrigger>
                  <TabsTrigger value="mobile" aria-label="Mobile preview" className="px-2.5 text-xs">
                    <Smartphone className="size-3.5" />
                    Mobile
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {device === "mobile" ? (
              <div className="max-h-[calc(100vh-9rem)] overflow-auto rounded-3xl bg-muted/50 p-3 ring-1 ring-foreground/5 md:p-4 dark:ring-foreground/10">
                {/* iframe gives the preview a true 390px viewport so the
                    renderer's responsive breakpoints reflect a real phone. */}
                <div className="mx-auto w-fit max-w-full overflow-hidden rounded-[2rem] border-4 border-foreground/10 bg-background shadow-lg">
                  <div className="h-[min(680px,70dvh)] w-[390px] max-w-[calc(100vw-4.5rem)]">
                    <PreviewFrame width={390}>
                      <div className="bg-background p-3">
                        <SopRenderer doc={draft} />
                      </div>
                    </PreviewFrame>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-9rem)] overflow-y-auto rounded-3xl bg-background p-3 shadow ring-1 ring-foreground/5 md:p-4 dark:ring-foreground/10">
                {/* pointer-events-none so preview links don't navigate the
                    dashboard; the container still scrolls. */}
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
