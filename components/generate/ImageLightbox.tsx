"use client";

import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Full-size view of a generated image. Loaded on first open (next/dynamic). */
export function ImageLightbox({
  open,
  onOpenChange,
  url,
  alt,
  meta,
  onDownload,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  alt: string;
  meta: string;
  onDownload: () => void;
  onCopy: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 p-3 sm:max-w-[min(96vw,1400px)] sm:p-4">
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-3xl bg-muted/40">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={url} alt={alt} className="block max-h-[calc(100dvh-10rem)] w-auto max-w-full object-contain" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-1 pb-1">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-medium leading-normal">{alt}</DialogTitle>
            <DialogDescription className="text-xs">{meta}</DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onCopy}>
            <Copy />
            Copy
          </Button>
          <Button type="button" size="sm" onClick={onDownload}>
            <Download />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
