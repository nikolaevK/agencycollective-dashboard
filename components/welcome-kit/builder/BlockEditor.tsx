"use client";

import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  WkBlock,
  WkCardItem,
  WkColumnItem,
  WkRowItem,
  WkVariant,
  WkMarker,
  WkCardsLayout,
} from "@/lib/welcomeKit";
import {
  IconPicker,
  Labeled,
  Select,
  StringListEditor,
  TextArea,
  TextInput,
} from "./fields";
import { move, removeAt, replaceAt, uid } from "./blocks";

const VARIANT_OPTIONS: { value: WkVariant; label: string }[] = [
  { value: "info", label: "Info (violet)" },
  { value: "success", label: "Success (green)" },
  { value: "warning", label: "Warning (amber)" },
  { value: "danger", label: "Danger (red)" },
  { value: "neutral", label: "Neutral (grey)" },
];

const MARKER_OPTIONS: { value: WkMarker; label: string }[] = [
  { value: "check", label: "Check icons" },
  { value: "dot", label: "Dots" },
];

const LAYOUT_OPTIONS: { value: WkCardsLayout; label: string }[] = [
  { value: "grid", label: "Grid (centered icon cards)" },
  { value: "list", label: "List (icon on the left)" },
];

const COLUMN_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "1 column" },
  { value: "2", label: "2 columns" },
  { value: "3", label: "3 columns" },
  { value: "4", label: "4 columns" },
];

function ItemShell({
  index,
  count,
  onUp,
  onDown,
  onRemove,
  children,
}: {
  index: number;
  count: number;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Item {index + 1}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onUp}
            disabled={index === 0}
            className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onDown}
            disabled={index === count - 1}
            className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            aria-label="Remove item"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function AddItemButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function BlockEditor({
  block,
  onChange,
}: {
  block: WkBlock;
  onChange: (b: WkBlock) => void;
}) {
  switch (block.type) {
    case "text":
      return (
        <TextArea
          label="Text (markdown)"
          value={block.body}
          onChange={(body) => onChange({ ...block, body })}
          placeholder="Write a paragraph… **bold**, *italic*, - lists and [links](url) are supported."
          rows={4}
        />
      );

    case "callout":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Style"
              value={block.variant}
              onChange={(variant) => onChange({ ...block, variant })}
              options={VARIANT_OPTIONS}
            />
            <IconPicker
              label="Icon"
              value={block.icon}
              onChange={(icon) => onChange({ ...block, icon })}
            />
          </div>
          <TextInput
            label="Title (optional)"
            value={block.title ?? ""}
            onChange={(title) => onChange({ ...block, title })}
            placeholder="Pro Tip"
          />
          <TextArea
            label="Body (markdown)"
            value={block.body}
            onChange={(body) => onChange({ ...block, body })}
            placeholder="Use - dashes for a bulleted list."
            rows={3}
          />
        </div>
      );

    case "stat":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextInput
              label="Big value"
              value={block.value}
              onChange={(value) => onChange({ ...block, value })}
              placeholder="1"
            />
            <TextInput
              label="Label"
              value={block.label}
              onChange={(label) => onChange({ ...block, label })}
              placeholder="Business Day"
            />
          </div>
          <TextArea
            label="Caption (optional)"
            value={block.caption ?? ""}
            onChange={(caption) => onChange({ ...block, caption })}
            placeholder="Response guarantee — most responses happen much faster."
            rows={2}
          />
        </div>
      );

    case "checklist":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextInput
              label="Title (optional)"
              value={block.title ?? ""}
              onChange={(title) => onChange({ ...block, title })}
              placeholder="Creative Assets Checklist"
            />
            <Select
              label="Marker"
              value={block.marker}
              onChange={(marker) => onChange({ ...block, marker })}
              options={MARKER_OPTIONS}
            />
          </div>
          <StringListEditor
            label="Items"
            items={block.items}
            onChange={(items) => onChange({ ...block, items })}
            placeholder="List item"
            addLabel="Add item"
          />
          <TextInput
            label="Footnote (optional)"
            value={block.note ?? ""}
            onChange={(note) => onChange({ ...block, note })}
            placeholder="All assets require approval before publishing."
          />
        </div>
      );

    case "cards": {
      const items = block.items;
      const setItem = (i: number, patch: Partial<WkCardItem>) =>
        onChange({ ...block, items: replaceAt(items, i, { ...items[i], ...patch }) });
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Layout"
              value={block.layout}
              onChange={(layout) => onChange({ ...block, layout })}
              options={LAYOUT_OPTIONS}
            />
            <Select
              label="Columns"
              value={String(block.columns)}
              onChange={(v) =>
                onChange({ ...block, columns: Number(v) as 1 | 2 | 3 | 4 })
              }
              options={COLUMN_OPTIONS}
            />
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <ItemShell
                key={it.id}
                index={i}
                count={items.length}
                onUp={() => onChange({ ...block, items: move(items, i, -1) })}
                onDown={() => onChange({ ...block, items: move(items, i, 1) })}
                onRemove={() => onChange({ ...block, items: removeAt(items, i) })}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                  <div className="sm:w-40 sm:shrink-0">
                    <IconPicker
                      label="Icon"
                      value={it.icon}
                      onChange={(icon) => setItem(i, { icon })}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <TextInput
                      value={it.label}
                      onChange={(label) => setItem(i, { label })}
                      placeholder="Label"
                    />
                    <TextInput
                      value={it.desc ?? ""}
                      onChange={(desc) => setItem(i, { desc })}
                      placeholder="Short description (optional)"
                    />
                  </div>
                </div>
              </ItemShell>
            ))}
            <AddItemButton
              label="Add card"
              onClick={() =>
                onChange({
                  ...block,
                  items: [...items, { id: uid("card"), icon: "star", label: "", desc: "" }],
                })
              }
            />
          </div>
        </div>
      );
    }

    case "columns": {
      const items = block.items;
      const setItem = (i: number, patch: Partial<WkColumnItem>) =>
        onChange({ ...block, items: replaceAt(items, i, { ...items[i], ...patch }) });
      return (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            1–3 columns render side by side. Each column is a card with an
            optional badge, intro, and bullet list.
          </p>
          <div className="space-y-2">
            {items.map((col, i) => (
              <ItemShell
                key={col.id}
                index={i}
                count={items.length}
                onUp={() => onChange({ ...block, items: move(items, i, -1) })}
                onDown={() => onChange({ ...block, items: move(items, i, 1) })}
                onRemove={() => onChange({ ...block, items: removeAt(items, i) })}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <IconPicker
                    label="Icon"
                    value={col.icon}
                    onChange={(icon) => setItem(i, { icon })}
                  />
                  <TextInput
                    label="Title"
                    value={col.title}
                    onChange={(title) => setItem(i, { title })}
                    placeholder="Slack"
                  />
                </div>
                <TextInput
                  label="Badge (optional)"
                  value={col.badge ?? ""}
                  onChange={(badge) => setItem(i, { badge })}
                  placeholder="Primary Channel"
                />
                <TextArea
                  label="Intro (optional)"
                  value={col.body ?? ""}
                  onChange={(body) => setItem(i, { body })}
                  placeholder="Short intro sentence."
                  rows={2}
                />
                <StringListEditor
                  label="Bullets"
                  items={col.bullets}
                  onChange={(bullets) => setItem(i, { bullets })}
                  placeholder="Bullet point"
                  addLabel="Add bullet"
                />
              </ItemShell>
            ))}
            <AddItemButton
              label="Add column"
              onClick={() =>
                onChange({
                  ...block,
                  items: [
                    ...items,
                    { id: uid("col"), icon: "star", title: "", badge: "", body: "", bullets: [""] },
                  ],
                })
              }
            />
          </div>
        </div>
      );
    }

    case "rows": {
      const rows = block.rows;
      const setRow = (i: number, patch: Partial<WkRowItem>) =>
        onChange({ ...block, rows: replaceAt(rows, i, { ...rows[i], ...patch }) });
      return (
        <div className="space-y-3">
          <TextInput
            label="Title (optional)"
            value={block.title ?? ""}
            onChange={(title) => onChange({ ...block, title })}
            placeholder="Platform Access Required"
          />
          <Labeled label="Rows">
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div
                  key={row.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => setRow(i, { label: e.target.value })}
                    placeholder="Label"
                    className="w-full sm:flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={row.value ?? ""}
                      onChange={(e) => setRow(i, { value: e.target.value })}
                      placeholder="Tag"
                      className="flex-1 sm:w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      type="button"
                      onClick={() => onChange({ ...block, rows: move(rows, i, -1) })}
                      disabled={i === 0}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange({ ...block, rows: move(rows, i, 1) })}
                      disabled={i === rows.length - 1}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange({ ...block, rows: removeAt(rows, i) })}
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                        "text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                      )}
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <AddItemButton
                label="Add row"
                onClick={() =>
                  onChange({
                    ...block,
                    rows: [...rows, { id: uid("row"), label: "", value: "" }],
                  })
                }
              />
            </div>
          </Labeled>
        </div>
      );
    }

    default:
      return null;
  }
}

/** Short human summary for the collapsed block header. */
export function blockSummary(block: WkBlock): string {
  switch (block.type) {
    case "text":
      return block.body.slice(0, 60) || "Empty text";
    case "callout":
      return block.title || block.body.slice(0, 60) || "Callout";
    case "stat":
      return [block.value, block.label].filter(Boolean).join(" · ") || "Stat";
    case "checklist":
      return block.title || `${block.items.length} items`;
    case "cards":
      return block.items.find((i) => i.label)?.label || `${block.items.length} cards`;
    case "columns":
      return block.items.map((i) => i.title).filter(Boolean).join(" · ") || `${block.items.length} columns`;
    case "rows":
      return block.title || `${block.rows.length} rows`;
    default:
      return "";
  }
}

export const BLOCK_TYPE_LABEL: Record<WkBlock["type"], string> = {
  text: "Text",
  callout: "Callout",
  stat: "Stat",
  checklist: "Checklist",
  cards: "Cards",
  columns: "Columns",
  rows: "Rows",
};
