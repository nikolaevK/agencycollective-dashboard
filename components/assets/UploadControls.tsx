"use client";

import { useRef } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { acceptFor, type AssetCategory } from "@/lib/clientAssetRules";
import type { UploadItem } from "@/hooks/useClientAssets";

export function UploadButton({
  category,
  onFiles,
  busy,
  label = "Upload",
  className,
}: {
  category: AssetCategory;
  onFiles: (files: File[]) => void;
  busy?: boolean;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60",
          className
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptFor(category)}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

export function UploadProgressList({
  items,
  onDismiss,
}: {
  items: UploadItem[];
  onDismiss: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2" aria-live="polite">
      {items.map((it) => (
        <li
          key={it.key}
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            it.phase === "error"
              ? "border-red-500/30 bg-red-500/5"
              : "border-border/60 bg-muted/30"
          )}
        >
          <div className="flex items-center gap-2">
            {it.phase === "done" ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : it.phase === "error" ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{it.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {it.phase === "uploading"
                ? `${Math.round(it.progress * 100)}%`
                : it.phase === "processing"
                  ? "Processing…"
                  : it.phase === "done"
                    ? "Uploaded"
                    : "Failed"}
            </span>
            {it.phase === "error" && (
              <button
                type="button"
                onClick={() => onDismiss(it.key)}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {it.phase === "uploading" && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.max(4, it.progress * 100)}%` }}
              />
            </div>
          )}
          {it.error && <p className="mt-1 text-red-600 dark:text-red-400">{it.error}</p>}
        </li>
      ))}
    </ul>
  );
}
