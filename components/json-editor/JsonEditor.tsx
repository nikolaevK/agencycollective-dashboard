"use client";

import { forwardRef, useCallback, useId, useMemo, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";

interface JsonEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** Accessible name of the text area. */
  ariaLabel: string;
  /** Parse error of `value` (null = valid, or empty). */
  error: string | null;
  /** Cmd/Ctrl+Enter — e.g. generate. */
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}

/**
 * Plain-text JSON editor with line numbers and a validity bar. Tab indents
 * (two spaces); press Esc first to Tab out of the editor.
 */
export const JsonEditor = forwardRef<HTMLTextAreaElement, JsonEditorProps>(function JsonEditor(
  { value, onChange, readOnly, ariaLabel, error, onSubmit, placeholder, className },
  ref
) {
  const lineNumbersRef = useRef<HTMLPreElement>(null);
  const escapedRef = useRef(false);
  const hintId = useId();
  const errorId = useId();
  const describedBy = [readOnly ? null : hintId, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  const lineCount = useMemo(() => value.split("\n").length, [value]);
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1).join("\n"),
    [lineCount]
  );

  const syncScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onSubmit?.();
        return;
      }
      if (e.key === "Escape") {
        // The next Tab leaves the editor instead of indenting.
        escapedRef.current = true;
        return;
      }
      const escaped = escapedRef.current;
      escapedRef.current = false;
      if (e.key !== "Tab" || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || escaped || readOnly) return;
      e.preventDefault();
      const el = e.currentTarget;
      // insertText keeps the browser's undo stack; fall back to a manual splice.
      if (!document.execCommand?.("insertText", false, "  ")) {
        const start = el.selectionStart;
        const next = value.slice(0, start) + "  " + value.slice(el.selectionEnd);
        onChange?.(next);
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = start + 2;
        });
      }
    },
    [onChange, onSubmit, readOnly, value]
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-input/30 ring-1 ring-foreground/5 focus-within:ring-[3px] focus-within:ring-ring/30">
        <pre
          ref={lineNumbersRef}
          aria-hidden
          className="w-12 shrink-0 select-none overflow-hidden border-r border-border/60 py-3 pr-2 text-right font-mono text-base leading-6 text-muted-foreground/60 md:w-11 md:text-xs md:leading-5"
        >
          {lineNumbers}
        </pre>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          // 16px below md: iOS Safari zooms into any field with smaller text on focus.
          // Same size + line height as the gutter, so the line numbers stay aligned.
          className={cn(
            "min-w-0 flex-1 resize-none bg-transparent px-3 py-3 font-mono text-base leading-6 outline-none placeholder:text-muted-foreground/60 md:text-xs md:leading-5",
            readOnly && "cursor-default text-muted-foreground"
          )}
        />
        {!readOnly && (
          <span id={hintId} className="sr-only">
            Tab inserts two spaces. To move focus out of the editor, press Escape, then Tab.
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2 pt-2 text-xs text-muted-foreground">
        {value.trim() &&
          (error ? (
            <StatusBadge tone="danger">Invalid JSON</StatusBadge>
          ) : (
            <StatusBadge tone="success">Valid JSON</StatusBadge>
          ))}
        <span className="tabular-nums">{lineCount} lines</span>
        {readOnly && <span>· read-only</span>}
        {error && (
          <span id={errorId} className="min-w-0 truncate text-destructive" title={error}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
});
