"use client";

import { useState } from "react";
import { Download, ExternalLink, FileText, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { formatBytes, formatDuration } from "@/lib/clientAssetRules";
import { assetFileUrl, useDeleteAsset, type AssetDto } from "@/hooks/useClientAssets";

/**
 * Full view of one asset. Images load the ≤1600px WebP preview (never the
 * multi-MB original); videos stream the original via Range requests with the
 * poster frame shown until play; PDFs open in a new tab. Download always
 * fetches the untouched original.
 */
export function AssetViewer({
  apiBase,
  asset,
  onClose,
}: {
  apiBase: string;
  asset: AssetDto | null;
  onClose: () => void;
}) {
  const remove = useDeleteAsset(apiBase);
  const [confirming, setConfirming] = useState(false);

  function close() {
    setConfirming(false);
    remove.reset();
    onClose();
  }

  const meta = asset
    ? [
        asset.mediaType === "pdf" ? "PDF" : asset.mediaType.charAt(0).toUpperCase() + asset.mediaType.slice(1),
        asset.width && asset.height ? `${asset.width}×${asset.height}` : null,
        asset.mediaType === "video" ? formatDuration(asset.durationMs) || null : null,
        formatBytes(asset.fileSize),
        formatDate(asset.createdAt),
        asset.uploadedByName ? `by ${asset.uploadedByName}` : null,
      ].filter(Boolean)
    : [];

  return (
    <Dialog open={asset !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        {asset && (
          <>
            <div className="min-w-0 px-4 pb-3 pr-12 pt-4 sm:px-5">
              <DialogTitle className="break-words text-base leading-snug">{asset.title}</DialogTitle>
              <DialogDescription className="mt-1 text-xs">{meta.join(" · ")}</DialogDescription>
            </div>

            <div className="flex items-center justify-center bg-black">
              {asset.mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={asset.id}
                  src={assetFileUrl(apiBase, asset.id, asset.hasPreview ? "preview" : "original")}
                  alt={asset.title}
                  className="max-h-[60dvh] sm:max-h-[70dvh] w-auto max-w-full object-contain"
                />
              ) : asset.mediaType === "video" ? (
                <video
                  key={asset.id}
                  src={assetFileUrl(apiBase, asset.id, "original")}
                  poster={
                    asset.hasPreview
                      ? assetFileUrl(apiBase, asset.id, "preview")
                      : asset.hasThumb
                        ? assetFileUrl(apiBase, asset.id, "thumb")
                        : undefined
                  }
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[60dvh] sm:max-h-[70dvh] w-full"
                />
              ) : (
                <div className="flex h-48 w-full flex-col items-center justify-center gap-3 bg-muted/30 text-muted-foreground">
                  <FileText className="h-12 w-12" />
                  <a
                    href={assetFileUrl(apiBase, asset.id, "original")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open PDF
                  </a>
                </div>
              )}
            </div>

            <div className="space-y-3 p-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={assetFileUrl(apiBase, asset.id, "original", true)}
                  download={asset.fileName ?? undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download original
                </a>
                {asset.canDelete &&
                  (confirming ? (
                    <span className="inline-flex flex-wrap items-center gap-2 text-xs text-red-600 dark:text-red-400">
                      Delete this file for everyone?
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(asset.id, { onSuccess: close })}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {remove.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="rounded-lg border border-border px-3 py-2 font-semibold text-foreground hover:bg-muted/50"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-red-500/40 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  ))}
              </div>
              {remove.error && (
                <p className="text-xs text-red-600 dark:text-red-400">{remove.error.message}</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
