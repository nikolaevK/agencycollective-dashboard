"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Click-to-edit roster cell. Enter (or blur) saves, Escape cancels; with
 * `multiline`, Enter saves and Shift+Enter inserts a newline. Empty input
 * saves as null. When the stored value is empty, `emptyDisplay` (e.g. a
 * derived perf fee with an "auto" hint) renders instead of the placeholder.
 */
export function InlineTextCell({
  value,
  onSave,
  placeholder = "—",
  emptyDisplay,
  type = "text",
  multiline,
  disabled,
  className,
}: {
  value: string | null;
  onSave: (next: string | null) => void;
  placeholder?: string;
  emptyDisplay?: ReactNode;
  type?: "text" | "date";
  multiline?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = multiline ? textareaRef.current : inputRef.current;
    el?.focus();
    if (el && type === "text") el.setSelectionRange(el.value.length, el.value.length);
  }, [editing, multiline, type]);

  function begin() {
    if (disabled) return;
    setDraft(value ?? "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = draft.trim() || null;
    if (next !== (value ?? null)) onSave(next);
  }

  function cancel() {
    setEditing(false);
  }

  if (editing) {
    // Kit fields, compact for the table. The date editor stays a native
    // <input type="date">: its Enter / blur-to-save / Escape-to-cancel cycle
    // is the cell's contract (a popover DatePicker would save on pick).
    const shared = "w-full px-2 py-1 text-xs text-foreground md:text-xs";
    return multiline ? (
      <Textarea
        ref={textareaRef}
        value={draft}
        rows={3}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            cancel();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(shared, "min-h-0 min-w-[160px] rounded-xl")}
      />
    ) : (
      <Input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            cancel();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(shared, "h-7 rounded-xl", type === "date" ? "min-w-[130px]" : "min-w-[70px]")}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        begin();
      }}
      disabled={disabled}
      className={cn(
        "-mx-1 max-w-full rounded-lg px-1 py-0.5 text-left text-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30",
        !disabled && "cursor-text hover:bg-muted",
        className
      )}
      title={disabled ? undefined : "Click to edit"}
    >
      {value ? (
        <span className={cn("text-foreground", multiline && "whitespace-pre-line line-clamp-3")}>
          {value}
        </span>
      ) : (
        emptyDisplay ?? <span className="text-muted-foreground/60">{placeholder}</span>
      )}
    </button>
  );
}
