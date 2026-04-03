"use client";

import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { InvoiceItem } from "@/types/invoice";
import { formatCurrencyValue } from "@/lib/invoice/validation";
import { cn } from "@/lib/utils";
import { INPUT_SM_CLS as INPUT_CLS } from "./styles";
import { InvoiceServiceSelector } from "./InvoiceServiceSelector";

interface Props {
  items: InvoiceItem[];
  currency: string;
  onUpdateItem: (id: string, field: keyof InvoiceItem, value: string | number) => void;
  onAddItem: () => void;
  onAddPreset: (item: InvoiceItem) => void;
  onRemoveItem: (id: string) => void;
  onUpdateItems: (items: InvoiceItem[]) => void;
}

function SortableRow({
  item,
  index,
  total,
  currency,
  onUpdateItem,
  onRemoveItem,
  onMoveUp,
  onMoveDown,
}: {
  item: InvoiceItem;
  index: number;
  total: number;
  currency: string;
  onUpdateItem: (id: string, field: keyof InvoiceItem, value: string | number) => void;
  onRemoveItem: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-b border-border/50 last:border-0",
        isDragging && "opacity-50 bg-accent"
      )}
    >
      <td className="py-2 pr-1">
        <div className="flex items-center gap-0.5">
          <button
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="flex flex-col">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:pointer-events-none"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:pointer-events-none"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
      </td>
      <td className="py-2 pr-2">
        <input
          type="text"
          value={item.name}
          onChange={(e) => onUpdateItem(item.id, "name", e.target.value)}
          placeholder="Item name"
          className={INPUT_CLS}
        />
      </td>
      <td className="py-2 pr-2">
        <textarea
          value={item.description}
          onChange={(e) => onUpdateItem(item.id, "description", e.target.value)}
          placeholder="Description"
          rows={1}
          className={cn(INPUT_CLS, "resize-y min-h-[32px]")}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min="0"
          step="any"
          value={item.quantity || ""}
          onChange={(e) =>
            onUpdateItem(item.id, "quantity", parseFloat(e.target.value) || 0)
          }
          className={cn(INPUT_CLS, "text-right")}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min="0"
          step="any"
          value={item.unitPrice || ""}
          onChange={(e) =>
            onUpdateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)
          }
          className={cn(INPUT_CLS, "text-right")}
        />
      </td>
      <td className="py-2 pr-2 text-right font-medium text-foreground whitespace-nowrap">
        {formatCurrencyValue(item.quantity * item.unitPrice, currency)}
      </td>
      <td className="py-2">
        <button
          type="button"
          onClick={() => onRemoveItem(item.id)}
          disabled={total <= 1}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

export function InvoiceItemsTable({
  items,
  currency,
  onUpdateItem,
  onAddItem,
  onAddPreset,
  onRemoveItem,
  onUpdateItems,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const subTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    onUpdateItems(arrayMove(items, oldIndex, newIndex));
  };

  const moveItem = (fromIndex: number, toIndex: number) => {
    onUpdateItems(arrayMove(items, fromIndex, toIndex));
  };

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
        Line Items
      </h3>

      {/* Desktop table with drag-and-drop */}
      <div className="hidden md:block overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <th className="pb-2 pr-1 w-16" />
                <th className="pb-2 pr-2">Item</th>
                <th className="pb-2 pr-2">Description</th>
                <th className="pb-2 pr-2 w-24 text-right">Qty</th>
                <th className="pb-2 pr-2 w-28 text-right">Unit Price</th>
                <th className="pb-2 pr-2 w-28 text-right">Total</th>
                <th className="pb-2 w-10" />
              </tr>
            </thead>
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {items.map((item, index) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    index={index}
                    total={items.length}
                    currency={currency}
                    onUpdateItem={onUpdateItem}
                    onRemoveItem={onRemoveItem}
                    onMoveUp={() => moveItem(index, index - 1)}
                    onMoveDown={() => moveItem(index, index + 1)}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="rounded-lg border border-border/50 bg-background p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Item {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveItem(index, index - 1)}
                  disabled={index === 0}
                  className="text-muted-foreground disabled:opacity-20"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => moveItem(index, index + 1)}
                  disabled={index === items.length - 1}
                  className="text-muted-foreground disabled:opacity-20"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
                  disabled={items.length <= 1}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <input
              type="text"
              value={item.name}
              onChange={(e) => onUpdateItem(item.id, "name", e.target.value)}
              placeholder="Item name"
              className={cn(INPUT_CLS, "h-9")}
            />
            <input
              type="text"
              value={item.description}
              onChange={(e) =>
                onUpdateItem(item.id, "description", e.target.value)
              }
              placeholder="Description (optional)"
              className={cn(INPUT_CLS, "h-9")}
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-0.5 block text-[10px] text-muted-foreground">Qty</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={item.quantity || ""}
                  onChange={(e) =>
                    onUpdateItem(item.id, "quantity", parseFloat(e.target.value) || 0)
                  }
                  className={cn(INPUT_CLS, "h-9 text-right")}
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-muted-foreground">Price</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={item.unitPrice || ""}
                  onChange={(e) =>
                    onUpdateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)
                  }
                  className={cn(INPUT_CLS, "h-9 text-right")}
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-muted-foreground">Total</label>
                <div className="flex h-9 items-center justify-end text-sm font-medium text-foreground">
                  {formatCurrencyValue(item.quantity * item.unitPrice, currency)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add item + subtotal */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onAddItem}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
          <InvoiceServiceSelector onSelect={onAddPreset} />
        </div>
        <div className="text-sm text-muted-foreground">
          Subtotal:{" "}
          <span className="font-semibold text-foreground">
            {formatCurrencyValue(subTotal, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
