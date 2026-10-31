"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookmarkPlus, Copy, GripVertical, Loader2, Lock, Plus, Trash2, Undo2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DecimalInput } from "@/components/invoice/InvoiceChargesForm";
import { InvoiceServiceSelector } from "@/components/invoice/InvoiceServiceSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { createEmptyItem, formatCurrencyValue, lineAmountOf } from "@/lib/invoice/validation";
import type { InvoiceItem } from "@/types/invoice";
import { cn } from "@/lib/utils";

/** Textarea that grows with its content (capped, then scrolls). */
function AutoGrowTextarea({
  value,
  onChange,
  disabled,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 384)}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      rows={2}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-h-[3.25rem] resize-y overflow-y-auto py-2 leading-relaxed"
    />
  );
}

const LABEL = "text-xs font-medium text-muted-foreground";
// Row actions: >= 36px tap targets on phones, compact on desktop.
const ACTION = "size-9 text-muted-foreground sm:size-7";

interface RowProps {
  item: InvoiceItem;
  index: number;
  currency: string;
  /** Read-only (a computed line, or the whole editor disabled). */
  locked: boolean;
  /** A computed line (lockedIds) — explains why it can't be edited. */
  computed: boolean;
  canRemove: boolean;
  canReorder: boolean;
  /** Room for the one-line table layout (measured on the editor, not the viewport). */
  wide: boolean;
  onPatch: (patch: Partial<InvoiceItem>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onSavePreset?: () => void;
  savingPreset: boolean;
}

function ItemRow({
  item,
  index,
  currency,
  locked,
  computed,
  canRemove,
  canReorder,
  wide,
  onPatch,
  onRemove,
  onDuplicate,
  onSavePreset,
  savingPreset,
}: RowProps) {
  // Disabled = neither draggable nor a drop target, so nothing can be dropped
  // into / above a computed line either.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canReorder,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = item.name.trim() || `Item ${index + 1}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-2xl border bg-card p-2.5 sm:p-3",
        locked && "border-dashed bg-muted/30",
        isDragging && "relative z-10 opacity-80 shadow-lg ring-2 ring-ring/30"
      )}
    >
      <div className="flex items-start gap-2">
        {canReorder ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-9 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing sm:mt-1 sm:h-7 sm:w-5"
            aria-label={`Reorder ${label}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical />
          </Button>
        ) : (
          <span className="w-9 shrink-0 sm:w-5" />
        )}

        <div className="min-w-0 flex-1 space-y-2">
          {/* Name + numbers: one table row when the editor is wide; otherwise
              the name gets its own full-width line so it stays readable (a
              drawer with the live preview beside it is narrow on any screen),
              Qty + Unit price share the next and the Total gets its own. */}
          <div className={cn("grid gap-2", wide ? "grid-cols-[minmax(0,1fr)_5rem_7.5rem_7rem]" : "grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
            <div className={wide ? undefined : "col-span-2"}>
              <Label className={cn(LABEL, "mb-1.5", wide ? "hidden" : "flex")}>
                Item
              </Label>
              <Input
                type="text"
                value={item.name}
                disabled={locked}
                onChange={(e) => onPatch({ name: e.target.value })}
                placeholder="Service name"
                aria-label={`Item ${index + 1} name`}
                className="font-medium"
              />
            </div>
            <div>
              <Label className={cn(LABEL, "mb-1.5", wide ? "hidden" : "flex")}>
                Qty
              </Label>
              <DecimalInput
                value={item.quantity}
                maxDecimals={4}
                disabled={locked}
                onChange={(quantity) => onPatch({ quantity })}
                ariaLabel={`${label} quantity`}
                className="text-right tabular-nums"
              />
            </div>
            <div>
              <Label className={cn(LABEL, "mb-1.5", wide ? "hidden" : "flex")}>
                Unit price
              </Label>
              <DecimalInput
                value={item.unitPrice}
                disabled={locked}
                onChange={(unitPrice) => onPatch({ unitPrice })}
                placeholder="0.00"
                ariaLabel={`${label} unit price`}
                className="text-right tabular-nums"
              />
            </div>
            {/* Never truncated: a clipped right-aligned amount loses its
                LEADING digits ($12,345.00 read as 2,345.00). A huge amount
                wraps instead. */}
            <div
              className={cn(
                "break-all text-right text-sm font-semibold tabular-nums text-foreground",
                wide ? "py-2 leading-5" : "col-span-2"
              )}
            >
              {!wide && <span className={cn(LABEL, "mr-2")}>Total</span>}
              {formatCurrencyValue(lineAmountOf(item), currency)}
            </div>
          </div>

          <AutoGrowTextarea
            value={item.description}
            disabled={locked}
            onChange={(description) => onPatch({ description })}
            placeholder="Description (optional) — blank lines start a new paragraph on the PDF"
            ariaLabel={`${label} description`}
          />

          {computed && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" /> Calculated from the invoice components above
            </p>
          )}
        </div>

        {/* Row actions — Remove sits at the bottom, away from Duplicate. */}
        <div className="flex shrink-0 flex-col items-center gap-1 self-stretch sm:mt-0.5">
          {onSavePreset && !locked && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onSavePreset}
              disabled={savingPreset || !item.name.trim()}
              title={item.name.trim() ? `Save "${item.name}" as a preset service` : "Name the item to save it as a preset"}
              aria-label={`Save ${label} as preset`}
              className={ACTION}
            >
              {savingPreset ? <Loader2 className="size-4 animate-spin sm:size-3.5" /> : <BookmarkPlus className="size-4 sm:size-3.5" />}
            </Button>
          )}
          {!locked && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onDuplicate}
              title="Duplicate line"
              aria-label={`Duplicate ${label}`}
              className={ACTION}
            >
              <Copy className="size-4 sm:size-3.5" />
            </Button>
          )}
          {!locked && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRemove}
              disabled={!canRemove}
              title={canRemove ? "Remove line" : "An invoice needs at least one line"}
              aria-label={`Remove ${label}`}
              className={cn(ACTION, "mt-auto hover:bg-destructive/10 hover:text-destructive")}
            >
              <Trash2 className="size-4 sm:size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  items: InvoiceItem[];
  currency: string;
  onChange: (items: InvoiceItem[]) => void;
  /** Lines computed from other inputs (e.g. the ad-account retainer / fee
   *  lines) — rendered read-only so a hand edit can't be silently overwritten
   *  the next time those inputs change. */
  lockedIds?: string[];
  /** Minimum line count (the remove button disables at it). */
  minItems?: number;
  /** Show the per-line "save as preset service" action. */
  allowSavePreset?: boolean;
  /** Feedback for preset saves (success/error) — the editor has no banner. */
  onNotice?: (notice: { type: "success" | "error"; text: string }) => void;
  disabled?: boolean;
}

/**
 * Line-item editor shared by every invoice surface (Invoice page, deal
 * invoice drawer, re-bill + ad-account drawers): labeled columns, a
 * full-width auto-growing description, drag / keyboard reordering, duplicate,
 * save-as-preset and the preset-service picker.
 */
export function LineItemsEditor({
  items,
  currency,
  onChange,
  lockedIds = [],
  minItems = 0,
  allowSavePreset = false,
  onNotice,
  disabled = false,
}: Props) {
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Last removed line — Remove has no confirm, so it's undoable for a few seconds.
  const [removed, setRemoved] = useState<{ item: InvoiceItem; index: number } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // dnd-kit cancels a drag on Escape, but its listener attaches after the
  // drawer's, so the drawer saw Escape first and closed mid-reorder. A no-op
  // layer on top of the Escape stack while dragging makes the drawer ignore
  // it; dnd-kit still gets the key and cancels the drag.
  useEscapeKey(() => {}, dragging);

  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 6000);
    return () => clearTimeout(t);
  }, [removed]);

  // Every edit goes through here; any further change retires the Undo.
  function emit(next: InvoiceItem[]) {
    setRemoved(null);
    onChange(next);
  }

  function patch(id: string, p: Partial<InvoiceItem>) {
    emit(
      items.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...p };
        next.total = lineAmountOf(next);
        return next;
      })
    );
  }

  function remove(index: number) {
    emit(items.filter((_, i) => i !== index));
    setRemoved({ item: items[index], index });
  }

  function undoRemove() {
    if (!removed) return;
    if (items.some((it) => it.id === removed.item.id)) {
      setRemoved(null);
      return;
    }
    const next = [...items];
    next.splice(Math.min(removed.index, next.length), 0, removed.item);
    emit(next);
  }

  const isLocked = (id: string) => lockedIds.includes(id);

  function handleDragEnd(event: DragEndEvent) {
    setDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Reorder only the editable lines, within the slots they already hold:
    // a computed line never moves (the ad-account drawer rebuilds
    // [...generated, ...extras], so a moved one would just snap back).
    const free = items.filter((i) => !isLocked(i.id));
    const from = free.findIndex((i) => i.id === active.id);
    const to = free.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(free, from, to);
    let k = 0;
    emit(items.map((i) => (isLocked(i.id) ? i : moved[k++])));
  }

  async function savePreset(item: InvoiceItem) {
    if (!item.name.trim()) return;
    setSavingId(item.id);
    try {
      const res = await fetch("/api/admin/invoice-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          description: item.description,
          rate: Math.round(item.unitPrice * 100),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      queryClient.invalidateQueries({ queryKey: ["invoice-services"] });
      onNotice?.({ type: "success", text: `"${item.name}" saved as a preset service` });
    } catch (e) {
      onNotice?.({ type: "error", text: e instanceof Error ? `Failed to save preset: ${e.message}` : "Failed to save preset" });
    } finally {
      setSavingId(null);
    }
  }

  const canReorder = !disabled && items.filter((i) => !isLocked(i.id)).length > 1;

  const rootRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setWide(el.clientWidth >= 640);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="space-y-2">
      {/* Column legend (desktop) — rows label themselves on phones. */}
      {items.length > 0 && wide && (
        <div className="flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
          <span className="w-5 shrink-0" />
          <div className="grid flex-1 grid-cols-[minmax(0,1fr)_5rem_7.5rem_7rem] gap-2">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Total</span>
          </div>
          <span className="w-7 shrink-0" />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragging(false)}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item, index) => {
              const computed = isLocked(item.id);
              const locked = disabled || computed;
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  currency={currency}
                  locked={locked}
                  computed={computed}
                  canRemove={items.length > minItems}
                  canReorder={canReorder && !computed}
                  wide={wide}
                  onPatch={(p) => patch(item.id, p)}
                  onRemove={() => remove(index)}
                  onDuplicate={() => {
                    const copy = { ...item, id: crypto.randomUUID() };
                    const next = [...items];
                    next.splice(index + 1, 0, copy);
                    emit(next);
                  }}
                  onSavePreset={allowSavePreset ? () => savePreset(item) : undefined}
                  savingPreset={savingId === item.id}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {items.length === 0 && (
        <p className="rounded-2xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No line items yet.
        </p>
      )}

      {removed && !disabled && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-2xl bg-muted/50 py-1 pl-3 pr-1 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">Removed {removed.item.name.trim() ? `"${removed.item.name.trim()}"` : "line"}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={undoRemove}
            className="h-9 shrink-0 text-foreground sm:h-7"
          >
            <Undo2 className="size-3.5" />
            Undo
          </Button>
        </div>
      )}

      {!disabled && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => emit([...items, createEmptyItem()])}
          >
            <Plus />
            Add item
          </Button>
          <InvoiceServiceSelector onSelect={(item) => emit([...items, item])} />
        </div>
      )}
    </div>
  );
}
