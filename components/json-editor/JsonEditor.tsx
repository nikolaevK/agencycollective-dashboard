"use client";

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { AlignLeft, RotateCcw, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  originalValue?: string;
  readOnly?: boolean;
  label: string;
  className?: string;
}

export function JsonEditor({
  value,
  onChange,
  originalValue,
  readOnly,
  label,
  className,
}: JsonEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // ── JSON validation ────────────────────────────────────────────────────
  const jsonError = useMemo(() => {
    if (!value.trim()) return null;
    try {
      JSON.parse(value);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [value]);

  // ── Line count ─────────────────────────────────────────────────────────
  const lineCount = useMemo(() => value.split("\n").length, [value]);

  // ── Sync scroll between textarea and line numbers ──────────────────────
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // ── Format ─────────────────────────────────────────────────────────────
  const handleFormat = useCallback(() => {
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed, null, 2));
    } catch {
      // can't format invalid JSON
    }
  }, [value, onChange]);

  // ── Reset ──────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (originalValue) onChange(originalValue);
  }, [originalValue, onChange]);

  // ── Copy ───────────────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for browsers without clipboard permission
    }
  }, [value]);

  // ── Tab key support ────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue =
          value.substring(0, start) + "  " + value.substring(end);
        onChange(newValue);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [value, onChange],
  );

  // ── Change count ───────────────────────────────────────────────────────
  const changeCount = useMemo(() => {
    if (!originalValue || !value) return 0;
    const origLines = originalValue.split("\n");
    const newLines = value.split("\n");
    let count = 0;
    const maxLen = Math.max(origLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (origLines[i] !== newLines[i]) count++;
    }
    return count;
  }, [value, originalValue]);

  // Auto-resize height on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "100%";
    }
  }, []);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {originalValue && changeCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
              {changeCount} {changeCount === 1 ? "change" : "changes"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
            title="Copy JSON"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          {!readOnly && (
            <>
              <button
                onClick={handleFormat}
                disabled={!!jsonError}
                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground disabled:opacity-50"
                title="Format JSON"
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </button>
              {originalValue && (
                <button
                  onClick={handleReset}
                  className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                  title="Reset to original"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Line numbers */}
        <div
          ref={lineNumbersRef}
          className="flex-none w-10 bg-muted/20 border-r border-border overflow-hidden select-none"
        >
          <div className="px-2 py-3 font-mono text-xs leading-5 text-muted-foreground/60 text-right">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          className={cn(
            "flex-1 resize-none bg-transparent font-mono text-xs leading-5 p-3 outline-none",
            "placeholder:text-muted-foreground/40",
            readOnly && "cursor-default",
          )}
          placeholder="JSON will appear here after analysis..."
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{lineCount} lines</span>
          {value && (
            <span
              className={cn(
                "flex items-center gap-1",
                jsonError ? "text-destructive" : "text-green-600 dark:text-green-400",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  jsonError ? "bg-destructive" : "bg-green-500",
                )}
              />
              {jsonError ? "Invalid JSON" : "Valid JSON"}
            </span>
          )}
        </div>
        {jsonError && (
          <span className="text-destructive truncate max-w-[50%]" title={jsonError}>
            {jsonError}
          </span>
        )}
      </div>
    </div>
  );
}
