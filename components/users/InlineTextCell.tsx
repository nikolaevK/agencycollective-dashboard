"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

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
    const shared =
      "w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
    return multiline ? (
      <textarea
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
        className={cn(shared, "resize-none min-w-[160px]")}
      />
    ) : (
      <input
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
        className={cn(shared, type === "date" ? "min-w-[130px]" : "min-w-[70px]")}
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
        "text-left text-xs rounded-md px-1 py-0.5 -mx-1 transition-colors max-w-full",
        !disabled && "cursor-text hover:bg-muted/60",
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
