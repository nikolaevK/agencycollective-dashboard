"use client";

import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatBytes, PICKABLE_IMAGE_TYPES } from "@/lib/jsonEditor/images";

export interface UploaderImage {
  previewUrl: string;
  name: string;
  width: number;
  height: number;
  /** Bytes that will be uploaded. */
  uploadSize: number;
  /** Scaled / re-encoded in the browser to fit the upload budget. */
  optimized: boolean;
}

interface ImageUploaderProps {
  label: string;
  required?: boolean;
  image: UploaderImage | null;
  preparing?: boolean;
  error?: string | null;
  disabled?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}

/** Drop zone / file picker with a preview once an image is chosen. */
export function ImageUploader({
  label,
  required,
  image,
  preparing,
  error,
  disabled,
  onPick,
  onRemove,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const blocked = !!(disabled || preparing);

  // Drag handlers stay live while blocked: a file dropped on a target that
  // doesn't cancel the drop is opened by the browser, replacing the page and
  // losing all work. While blocked the drop is refused and the file ignored.
  const dropHandlers = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = blocked ? "none" : "copy";
      if (!blocked) setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && !blocked) onPick(file);
    },
  };

  const heading = (
    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
      <span>
        {label}
        {required && <span className="sr-only"> (required)</span>}
      </span>
      {!required && <span className="font-normal">Optional</span>}
    </div>
  );

  if (image) {
    return (
      <div>
        {heading}
        {/* Dropping onto the preview replaces the image. */}
        <div
          {...dropHandlers}
          className={cn(
            "relative overflow-hidden rounded-2xl bg-muted/50 ring-1 transition-shadow",
            dragOver ? "ring-2 ring-foreground/40" : "ring-foreground/5"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.previewUrl} alt={label} className="h-36 w-full object-contain" />
          {!disabled && (
            <Button
              type="button"
              variant="secondary"
              size="icon-xs"
              onClick={onRemove}
              aria-label={`Remove ${label.toLowerCase()}`}
              className="absolute right-2 top-2 shadow-sm"
            >
              <X />
            </Button>
          )}
        </div>
        <p className="mt-1.5 truncate text-xs text-muted-foreground" title={image.name}>
          {image.name}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {image.width}×{image.height} · {formatBytes(image.uploadSize)}
          {image.optimized && " · resized for upload"}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {heading}
      {/* aria-disabled, not disabled: a disabled button gets no drag events. */}
      <button
        type="button"
        aria-disabled={blocked || undefined}
        aria-label={preparing ? `Preparing ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}
        onClick={() => {
          if (!blocked) inputRef.current?.click();
        }}
        {...dropHandlers}
        className={cn(
          "flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 text-center outline-none transition-colors",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
          blocked
            ? "cursor-not-allowed border-border opacity-50"
            : dragOver
              ? "border-foreground/40 bg-muted"
              : "border-border hover:bg-muted/50"
        )}
      >
        {preparing ? (
          <>
            <Loader2 aria-hidden className="size-5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Preparing image…</span>
          </>
        ) : (
          <>
            <ImagePlus aria-hidden className="size-5 text-muted-foreground" />
            <span className="text-xs font-medium">Drop, paste or browse</span>
            <span className="text-[11px] text-muted-foreground">PNG, JPEG, WebP or GIF</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={PICKABLE_IMAGE_TYPES.join(",")}
        aria-label={label}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so picking the same file again still fires.
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
