"use client";

import { useCallback, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  resolveMimeType,
  titleFromFileName,
  validateUpload,
  type AssetCategory,
  type AssetMediaType,
  type AssetSection,
  type AssetVariant,
} from "@/lib/clientAssetRules";
import type { AssetDto } from "@/lib/clientAssetHttp";
import { probeVideo } from "@/lib/videoPoster";

// Client assets (My Brand + Ad Creatives) over either route tree:
//   portal → "/api/portal/assets"
//   admin  → "/api/admin/clients/<userId>/assets"
// The same components drive both; the server decides what each side may do
// (each DTO carries canDelete).

export type { AssetDto };

export interface AssetPage {
  items: AssetDto[];
  nextCursor: string | null;
  /** Ready-asset counts per media type — first page only. */
  counts: Record<string, number> | null;
}

export function assetFileUrl(apiBase: string, assetId: string, variant: AssetVariant, download = false): string {
  const params = new URLSearchParams();
  if (variant !== "original") params.set("variant", variant);
  if (download) params.set("download", "1");
  const qs = params.toString();
  return `${apiBase}/${encodeURIComponent(assetId)}/file${qs ? `?${qs}` : ""}`;
}

async function readError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    if (json?.error) return String(json.error);
  } catch {
    // fall through
  }
  return `Request failed (HTTP ${res.status})`;
}

const assetsKey = (apiBase: string) => ["client-assets", apiBase] as const;

export function useAssetList(
  apiBase: string,
  section: AssetSection,
  opts: { type?: AssetMediaType | null; limit?: number } = {}
) {
  return useInfiniteQuery({
    queryKey: [...assetsKey(apiBase), section, opts.type ?? "all", opts.limit ?? 0],
    queryFn: async ({ pageParam }): Promise<AssetPage> => {
      const params = new URLSearchParams({ section });
      if (opts.type) params.set("type", opts.type);
      if (opts.limit) params.set("limit", String(opts.limit));
      if (pageParam) params.set("cursor", pageParam);
      const res = await fetch(`${apiBase}?${params.toString()}`);
      if (!res.ok) throw new Error(await readError(res));
      return (await res.json()).data as AssetPage;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60_000,
  });
}

export function useDeleteAsset(apiBase: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assetId: string) => {
      const res = await fetch(`${apiBase}/${encodeURIComponent(assetId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: assetsKey(apiBase) }),
  });
}

export function useAddLink(apiBase: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { url: string; title: string }) => {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "link", url: input.url, title: input.title }),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: assetsKey(apiBase) }),
  });
}

// ── Uploads ────────────────────────────────────────────────────────────────

export interface UploadItem {
  key: string;
  name: string;
  /** 0..1 over the bytes sent. */
  progress: number;
  phase: "uploading" | "processing" | "done" | "error";
  error?: string;
}

const CHUNK_RETRIES = 3;

async function putChunkWithRetry(url: string, body: Blob): Promise<void> {
  let lastError = "Upload failed";
  for (let attempt = 0; attempt < CHUNK_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body,
      });
      if (res.ok) return;
      lastError = await readError(res);
      // 4xx = the server rejected this chunk; retrying won't help.
      if (res.status < 500) break;
    } catch {
      lastError = "Network error — check your connection";
    }
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  throw new Error(lastError);
}

/**
 * Chunked upload of one file: start → PUT ≤3 MB chunks in order → complete.
 * A failed upload is deleted server-side so it never lingers half-written.
 */
async function uploadOne(
  apiBase: string,
  file: File,
  category: AssetCategory,
  onProgress: (progress: number, phase: UploadItem["phase"]) => void
): Promise<void> {
  const mimeType = resolveMimeType(file.name, file.type);
  const check = validateUpload({ category, mimeType: mimeType ?? "", fileSize: file.size });
  if (!check.ok) throw new Error(check.error);

  const probe = check.mediaType === "video" ? await probeVideo(file) : null;

  const start = await fetch(apiBase, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category,
      fileName: file.name,
      mimeType,
      fileSize: file.size,
      title: titleFromFileName(file.name),
    }),
  });
  if (!start.ok) throw new Error(await readError(start));
  const { asset, chunkSize, chunkCount } = (await start.json()).data as {
    asset: AssetDto;
    chunkSize: number;
    chunkCount: number;
  };
  const base = `${apiBase}/${encodeURIComponent(asset.id)}`;

  try {
    for (let seq = 0; seq < chunkCount; seq++) {
      const from = seq * chunkSize;
      await putChunkWithRetry(`${base}/chunks/${seq}`, file.slice(from, Math.min(from + chunkSize, file.size)));
      onProgress((seq + 1) / chunkCount, "uploading");
    }
    onProgress(1, "processing");
    const done = await fetch(`${base}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(probe ?? {}),
    });
    if (!done.ok) throw new Error(await readError(done));
  } catch (err) {
    fetch(base, { method: "DELETE" }).catch(() => {});
    throw err;
  }
}

/** Sequential upload queue with per-file progress for one category. */
export function useAssetUploads(apiBase: string, category: AssetCategory) {
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);

  const patch = useCallback((key: string, changes: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...changes } : it)));
  }, []);

  const upload = useCallback(
    async (files: File[]) => {
      const queued = files.map((f, i) => ({
        file: f,
        key: `${Date.now()}-${i}-${f.name}`,
      }));
      setItems((prev) => [
        ...prev.filter((it) => it.phase !== "done"),
        ...queued.map(({ file, key }) => ({ key, name: file.name, progress: 0, phase: "uploading" as const })),
      ]);
      for (const { file, key } of queued) {
        try {
          await uploadOne(apiBase, file, category, (progress, phase) => patch(key, { progress, phase }));
          patch(key, { progress: 1, phase: "done" });
          qc.invalidateQueries({ queryKey: assetsKey(apiBase) });
        } catch (err) {
          patch(key, { phase: "error", error: err instanceof Error ? err.message : "Upload failed" });
        }
      }
      // Finished rows fade from the list; errors stay until dismissed.
      setTimeout(() => setItems((prev) => prev.filter((it) => it.phase !== "done")), 2500);
    },
    [apiBase, category, patch, qc]
  );

  const dismiss = useCallback((key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }, []);

  const busy = items.some((it) => it.phase === "uploading" || it.phase === "processing");
  return { items, upload, dismiss, busy };
}
