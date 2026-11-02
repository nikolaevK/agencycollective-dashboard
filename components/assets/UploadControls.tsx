"use client";

import { useRef } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={className}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {label}
      </Button>
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
            "rounded-2xl px-3 py-2 text-xs",
            it.phase === "error"
              ? cn("border", badgeTone.danger)
              : "bg-muted/50"
          )}
        >
          <div className="flex items-center gap-2">
            {it.phase === "done" ? (
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
            ) : it.phase === "error" ? (
              <AlertTriangle className="size-3.5 shrink-0" />
            ) : (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{it.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {it.phase === "uploading"
                ? `${Math.round(it.progress * 100)}%`
                : it.phase === "processing"
                  ? "Processing…"
                  : it.phase === "done"
                    ? "Uploaded"
                    : "Failed"}
            </span>
            {it.phase === "error" && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onDismiss(it.key)}
                className="shrink-0 text-muted-foreground"
                aria-label="Dismiss"
              >
                <X />
              </Button>
            )}
          </div>
          {it.phase === "uploading" && (
            <Progress
              value={Math.max(4, it.progress * 100)}
              className="mt-1.5 h-1 [&>div]:bg-chart-1 [&>div]:duration-300"
            />
          )}
          {it.error && <p className="mt-1 text-destructive">{it.error}</p>}
        </li>
      ))}
    </ul>
  );
}
