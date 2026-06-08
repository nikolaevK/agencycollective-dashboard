"use client";

import { useRef } from "react";
import { Bold, Italic, Heading, List, ListOrdered, Link2, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Labeled } from "@/components/welcome-kit/builder/fields";

type WrapAction = { icon: typeof Bold; title: string; wrap: [string, string]; sample: string };
type PrefixAction = { icon: typeof Bold; title: string; prefix: string };
type Action = WrapAction | PrefixAction;

const FULL_ACTIONS: Action[] = [
  { icon: Bold, title: "Bold", wrap: ["**", "**"], sample: "bold text" },
  { icon: Italic, title: "Italic", wrap: ["*", "*"], sample: "italic text" },
  { icon: Heading, title: "Heading", prefix: "### " },
  { icon: List, title: "Bulleted list", prefix: "- " },
  { icon: ListOrdered, title: "Numbered list", prefix: "1. " },
  { icon: Link2, title: "Link", wrap: ["[", "](https://)"], sample: "link text" },
  { icon: Quote, title: "Quote / callout line", prefix: "> " },
];

// For short, single-line fields (e.g. a step) only inline styles make sense.
const COMPACT_ACTIONS: Action[] = [
  { icon: Bold, title: "Bold", wrap: ["**", "**"], sample: "bold text" },
  { icon: Italic, title: "Italic", wrap: ["*", "*"], sample: "italic text" },
  { icon: Link2, title: "Link", wrap: ["[", "](https://)"], sample: "link text" },
];

/**
 * A Markdown textarea with a formatting toolbar so users who don't know
 * Markdown can still bold text, add headings, lists, links, etc. Buttons wrap
 * the current selection (or insert a sample) / prefix the selected lines.
 */
export function MarkdownTextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  compact = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  compact?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const actions = compact ? COMPACT_ACTIONS : FULL_ACTIONS;

  function apply(a: Action) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    let next = value;
    let selStart = start;
    let selEnd = end;

    if ("wrap" in a) {
      const [pre, post] = a.wrap;
      const inner = value.slice(start, end) || a.sample;
      next = value.slice(0, start) + pre + inner + post + value.slice(end);
      selStart = start + pre.length;
      selEnd = selStart + inner.length;
    } else {
      // Prefix every line touched by the selection (great for lists).
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const block = value.slice(lineStart, Math.max(end, start));
      const prefixed = block.split("\n").map((l) => a.prefix + l).join("\n");
      next = value.slice(0, lineStart) + prefixed + value.slice(Math.max(end, start));
      selStart = lineStart;
      selEnd = lineStart + prefixed.length;
    }

    onChange(next);
    // Restore focus + selection after the controlled re-render.
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    });
  }

  return (
    <Labeled label={label}>
      <div className="rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-primary/40">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={i}
                type="button"
                title={a.title}
                aria-label={a.title}
                onMouseDown={(e) => e.preventDefault()} // keep textarea selection
                onClick={() => apply(a)}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
          <span className="ml-auto hidden pr-1 text-[10px] text-muted-foreground sm:block">
            **bold** · *italic* · [text](url)
          </span>
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={cn("w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none")}
        />
      </div>
    </Labeled>
  );
}
