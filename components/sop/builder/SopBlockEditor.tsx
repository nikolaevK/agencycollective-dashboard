"use client";

import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { SopBlock, SopStepsBlock, SopStep } from "@/lib/sop";
import type { WkBlock, WkVariant } from "@/lib/welcomeKit";
import { BlockEditor } from "@/components/welcome-kit/builder/BlockEditor";
import { IconPicker, Labeled, Select, TextInput, Toggle } from "@/components/welcome-kit/builder/fields";
import { MarkdownTextArea } from "./MarkdownTextArea";
import { move, removeAt, replaceAt, uid } from "./sopBlocks";

const VARIANT_OPTIONS: { value: WkVariant; label: string }[] = [
  { value: "info", label: "Info (violet)" },
  { value: "success", label: "Success (green)" },
  { value: "warning", label: "Warning (amber)" },
  { value: "danger", label: "Danger (red)" },
  { value: "neutral", label: "Neutral (grey)" },
];

function StepsEditor({
  block,
  onChange,
}: {
  block: SopStepsBlock;
  onChange: (b: SopBlock) => void;
}) {
  const steps = block.steps;
  const setStep = (i: number, patch: Partial<SopStep>) =>
    onChange({ ...block, steps: replaceAt(steps, i, { ...steps[i], ...patch }) });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextInput
          label="Title (optional)"
          value={block.title ?? ""}
          onChange={(title) => onChange({ ...block, title })}
          placeholder="Step-by-step process"
        />
        <div className="flex items-end">
          <Toggle
            label="Numbered (off = bullets)"
            checked={block.ordered}
            onChange={(ordered) => onChange({ ...block, ordered })}
          />
        </div>
      </div>

      <Labeled label="Steps">
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={step.id} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Step {i + 1}
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onChange({ ...block, steps: move(steps, i, -1) })}
                    disabled={i === 0}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ...block, steps: move(steps, i, 1) })}
                    disabled={i === steps.length - 1}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ...block, steps: removeAt(steps, i) })}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                    aria-label="Remove step"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <MarkdownTextArea
                compact
                value={step.text}
                onChange={(text) => setStep(i, { text })}
                placeholder="What to do…"
                rows={2}
              />
              <TextInput
                value={step.detail ?? ""}
                onChange={(detail) => setStep(i, { detail })}
                placeholder="Supporting detail (optional)"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({ ...block, steps: [...steps, { id: uid("step"), text: "", detail: "" }] })
            }
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add step
          </button>
        </div>
      </Labeled>
    </div>
  );
}

/** Per-block editor. Text & callout bodies get the Markdown toolbar; the SOP-only
 *  `steps` block has its own editor; everything else uses the shared BlockEditor. */
export function SopBlockEditor({
  block,
  onChange,
}: {
  block: SopBlock;
  onChange: (b: SopBlock) => void;
}) {
  if (block.type === "steps") {
    return <StepsEditor block={block} onChange={onChange} />;
  }

  if (block.type === "text") {
    return (
      <MarkdownTextArea
        label="Text"
        value={block.body}
        onChange={(body) => onChange({ ...block, body })}
        placeholder="Write a paragraph… use the buttons above for bold, headings, lists and links."
        rows={5}
      />
    );
  }

  if (block.type === "callout") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Style"
            value={block.variant}
            onChange={(variant) => onChange({ ...block, variant })}
            options={VARIANT_OPTIONS}
          />
          <IconPicker label="Icon" value={block.icon} onChange={(icon) => onChange({ ...block, icon })} />
        </div>
        <TextInput
          label="Title (optional)"
          value={block.title ?? ""}
          onChange={(title) => onChange({ ...block, title })}
          placeholder="Pro Tip"
        />
        <MarkdownTextArea
          label="Body"
          value={block.body}
          onChange={(body) => onChange({ ...block, body })}
          placeholder="Use the buttons above for formatting."
          rows={3}
        />
      </div>
    );
  }

  return <BlockEditor block={block as WkBlock} onChange={(b) => onChange(b as SopBlock)} />;
}
