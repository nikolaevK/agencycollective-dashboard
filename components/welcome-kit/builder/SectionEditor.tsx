"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveIcon } from "@/components/welcome-kit/icons";
import type { WkBlock, WkBlockType, WkSection } from "@/lib/welcomeKit";
import { CollapsibleCard, IconPicker, MoveControls, TextInput } from "./fields";
import { BLOCK_TYPES, move, newBlock, removeAt, replaceAt } from "./blocks";
import { BLOCK_TYPE_LABEL, BlockEditor, blockSummary } from "./BlockEditor";

function AddBlockMenu({ onAdd }: { onAdd: (type: WkBlockType) => void }) {
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
            {BLOCK_TYPES.map((b) => (
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

export function SectionEditor({
  section,
  index,
  count,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  section: WkSection;
  index: number;
  count: number;
  onChange: (s: WkSection) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const Icon = resolveIcon(section.icon);
  const blocks = section.blocks;

  const setBlock = (i: number, b: WkBlock) =>
    onChange({ ...section, blocks: replaceAt(blocks, i, b) });

  return (
    <CollapsibleCard
      icon={<Icon className="h-4 w-4" />}
      title={section.title || "Untitled section"}
      subtitle={section.num || `${blocks.length} block${blocks.length === 1 ? "" : "s"}`}
      controls={
        <MoveControls
          onUp={onMoveUp}
          onDown={onMoveDown}
          onRemove={onRemove}
          canUp={index > 0}
          canDown={index < count - 1}
          removeLabel="Delete section"
        />
      }
    >
      {/* Section meta */}
      <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
        <IconPicker
          label="Icon"
          value={section.icon}
          onChange={(icon) => onChange({ ...section, icon })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextInput
            label="Eyebrow"
            value={section.num}
            onChange={(num) => onChange({ ...section, num })}
            placeholder="01 / Communication"
          />
          <TextInput
            label="Heading"
            value={section.title}
            onChange={(title) => onChange({ ...section, title })}
            placeholder="How We Connect"
          />
        </div>
      </div>

      {/* Blocks */}
      <div className="space-y-2 pt-1">
        {blocks.map((block, i) => (
          <CollapsibleCard
            key={block.id}
            tone="muted"
            title={
              <span className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  {BLOCK_TYPE_LABEL[block.type]}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground">
                  {blockSummary(block)}
                </span>
              </span>
            }
            controls={
              <MoveControls
                onUp={() => onChange({ ...section, blocks: move(blocks, i, -1) })}
                onDown={() => onChange({ ...section, blocks: move(blocks, i, 1) })}
                onRemove={() => onChange({ ...section, blocks: removeAt(blocks, i) })}
                canUp={i > 0}
                canDown={i < blocks.length - 1}
                removeLabel="Delete block"
              />
            }
          >
            <BlockEditor block={block} onChange={(b) => setBlock(i, b)} />
          </CollapsibleCard>
        ))}

        {blocks.length === 0 && (
          <p className={cn("text-xs text-muted-foreground italic px-1")}>
            No blocks yet — add one below.
          </p>
        )}

        <AddBlockMenu
          onAdd={(type) => onChange({ ...section, blocks: [...blocks, newBlock(type)] })}
        />
      </div>
    </CollapsibleCard>
  );
}
