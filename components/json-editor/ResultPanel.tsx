"use client";

import { Download, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResultPanelProps {
  sourcePreview: string | null;
  resultImage: { base64: string; mimeType: string } | null;
  resultText: string | null;
  onEditAndRegenerate: () => void;
  onStartOver: () => void;
  className?: string;
}

export function ResultPanel({
  sourcePreview,
  resultImage,
  resultText,
  onEditAndRegenerate,
  onStartOver,
  className,
}: ResultPanelProps) {
  const handleDownload = () => {
    if (!resultImage) return;
    const ext = resultImage.mimeType.split("/")[1] || "png";
    const link = document.createElement("a");
    link.href = `data:${resultImage.mimeType};base64,${resultImage.base64}`;
    link.download = `json-editor-${Date.now()}.${ext}`;
    link.click();
  };

  return (
    <div className={cn("flex flex-col gap-4 overflow-y-auto", className)}>
      {/* Source image */}
      {sourcePreview && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">
            Source Image
          </div>
          <div className="rounded-lg overflow-hidden border border-border bg-muted/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourcePreview}
              alt="Source"
              className="w-full h-auto max-h-56 object-contain"
            />
          </div>
        </div>
      )}

      {/* Result image */}
      {resultImage && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">
            Generated Result
          </div>
          <div className="rounded-lg overflow-hidden border border-primary/20 bg-muted/30 ring-1 ring-primary/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${resultImage.mimeType};base64,${resultImage.base64}`}
              alt="Generated result"
              className="w-full h-auto max-h-72 object-contain"
            />
          </div>

          {/* Result text from Gemini (if any) */}
          {resultText && (
            <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
              {resultText}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button
              onClick={onEditAndRegenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Edit & Redo
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!sourcePreview && !resultImage && (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/60 p-8 text-center">
          Upload an image and analyze it to get started
        </div>
      )}

      {/* Start over */}
      {(sourcePreview || resultImage) && (
        <button
          onClick={onStartOver}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mt-auto"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Start Over
        </button>
      )}
    </div>
  );
}
