"use client";

import { useQuery } from "@tanstack/react-query";
import type { SopListItem } from "@/lib/sop";
import type { SopFolder } from "@/lib/sopFolders";

export interface SopLibraryData {
  sops: SopListItem[];
  folders: SopFolder[];
  tags: string[];
}

/** Library list + folders + tags, filtered by folder/tag. */
export function useSopLibrary(params: { folder?: string; tag?: string }) {
  return useQuery<SopLibraryData>({
    queryKey: ["sops", params.folder ?? null, params.tag ?? null],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.folder) qs.set("folder", params.folder);
      if (params.tag) qs.set("tag", params.tag);
      const res = await fetch(`/api/admin/sops${qs.toString() ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).data as SopLibraryData;
    },
    staleTime: 15_000,
  });
}

/** A minimal starter doc for a new SOP (server normalizes + assigns ids). */
export function newSopDoc() {
  return {
    title: "New SOP",
    summary: "",
    sections: [
      {
        num: "01 / Purpose",
        icon: "target",
        title: "Purpose & Scope",
        blocks: [{ type: "text", body: "" }],
      },
    ],
  };
}

export async function createSopRequest(body: {
  doc: unknown;
  folder?: string;
  tags?: string[];
  status?: string;
}): Promise<{ id: string }> {
  const res = await fetch("/api/admin/sops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `HTTP ${res.status}`);
  }
  return (await res.json()).data as { id: string };
}

export async function deleteSopRequest(id: string): Promise<void> {
  const res = await fetch(`/api/admin/sops/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
