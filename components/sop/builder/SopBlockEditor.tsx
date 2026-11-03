"use client";

import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SopBlock, SopStepsBlock, SopStep } from "@/lib/sop";
import type { WkBlock, WkVariant } from "@/lib/welcomeKit";
import { BlockEditor } from "@/components/welcome-kit/builder/BlockEditor";
import { IconPicker, Labeled, Select, TextInput, Toggle } from "@/components/welcome-kit/builder/fields";
import { MarkdownTextArea } from "./MarkdownTextArea";
import { move, removeAt, replaceAt, uid } from "./sopBlocks";

const VARIANT_OPTIONS: { value: WkVariant; label: string }[] = [
  { value: "info", label: "Info (blue)" },
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
            <div key={step.id} className="space-y-2 rounded-2xl bg-card p-3 ring-1 ring-foreground/5 dark:ring-foreground/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Step {i + 1}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onChange({ ...block, steps: move(steps, i, -1) })}
                    disabled={i === 0}
                    className="text-muted-foreground"
                    aria-label="Move up"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onChange({ ...block, steps: move(steps, i, 1) })}
                    disabled={i === steps.length - 1}
                    className="text-muted-foreground"
                    aria-label="Move down"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onChange({ ...block, steps: removeAt(steps, i) })}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove step"
                  >
                    <Trash2 />
                  </Button>
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
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() =>
              onChange({ ...block, steps: [...steps, { id: uid("step"), text: "", detail: "" }] })
            }
            className="text-muted-foreground"
          >
            <Plus />
            Add step
          </Button>
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
