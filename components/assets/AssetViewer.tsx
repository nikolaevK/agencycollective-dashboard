"use client";

import { useState } from "react";
import { Download, ExternalLink, FileText, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-4xl">
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
                <div className="flex h-48 w-full flex-col items-center justify-center gap-3 bg-muted/50 text-muted-foreground">
                  <FileText className="size-8" />
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={assetFileUrl(apiBase, asset.id, "original")}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink />
                      Open PDF
                    </a>
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-3 p-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <a
                    href={assetFileUrl(apiBase, asset.id, "original", true)}
                    download={asset.fileName ?? undefined}
                  >
                    <Download />
                    Download original
                  </a>
                </Button>
                {asset.canDelete &&
                  (confirming ? (
                    <span className="inline-flex flex-wrap items-center gap-2 text-sm text-destructive">
                      Delete this file for everyone?
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(asset.id, { onSuccess: close })}
                      >
                        {remove.isPending && <Loader2 className="animate-spin" />}
                        Delete
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirming(false)}
                      >
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirming(true)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  ))}
              </div>
              {remove.error && (
                <p className="text-xs text-destructive">{remove.error.message}</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
