"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface UploadItem {
  id: string;
  name: string;
  /** object URL of the original file (revoked on remove/unmount). */
  previewUrl: string;
  /** The original — what a draft ad gets (re-encoded only if it's too big for the request). */
  file: File;
  /** Compact copy Claude reads (lib/adCopy/imageEncode prepareForAnalysis). */
  analysis: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; width: number; height: number };
}

interface UploadZoneProps {
  uploads: UploadItem[];
  processing: number;
  max: number;
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** Drop / click / paste (paste is wired by the parent while the tab is active). */
export function UploadZone({ uploads, processing, max, onAddFiles, onRemove, onClear }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = uploads.length + processing >= max;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Upload originals</p>
          <p className="text-xs text-muted-foreground">
            High-res files read promo codes and small print best. Drop, paste or browse — JPEG, PNG, WebP or GIF.
          </p>
        </div>
        {uploads.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>

      {(uploads.length > 0 || processing > 0) && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" role="list">
          {uploads.map((img) => (
            <li key={img.id} className="group relative aspect-square overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.previewUrl} alt={img.name} className="size-full object-cover" />
              <Button
                type="button"
                variant="secondary"
                size="icon-xs"
                onClick={() => onRemove(img.id)}
                aria-label={`Remove ${img.name}`}
                className="absolute right-1.5 top-1.5 bg-background/85 backdrop-blur-sm sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                <X />
              </Button>
            </li>
          ))}
          {Array.from({ length: processing }, (_, i) => (
            <li key={`p${i}`} className="flex aspect-square items-center justify-center rounded-2xl bg-muted">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Preparing image" />
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const files = Array.from(e.dataTransfer.files ?? []);
            if (files.length) onAddFiles(files);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30",
            dragging && "border-foreground/40 bg-muted/60 text-foreground"
          )}
        >
          <ImagePlus className="size-5" aria-hidden />
          <span className="font-medium">{uploads.length === 0 ? "Add images" : `Add more (${uploads.length}/${max})`}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onAddFiles(files);
        }}
      />
    </div>
  );
}
