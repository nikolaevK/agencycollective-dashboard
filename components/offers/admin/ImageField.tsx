"use client";

import { useEffect, useMemo, useState } from "react";
import { Upload, X } from "lucide-react";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * A pending image change in an editor: a picked file, a removal, or nothing.
 * Nothing is uploaded until `commit` (called after the owner record is saved);
 * a committed change isn't re-sent, and a later removal always is.
 */
export function useImageDraft(currentUrl: string | null, maxBytes: number) {
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  return {
    previewUrl: fileUrl ?? (removed ? null : currentUrl),
    /** A pick or removal not yet committed. */
    dirty,
    error,
    pick(f: File | undefined) {
      setError(null);
      if (!f) return;
      if (!IMAGE_TYPES.includes(f.type)) return setError("Use a PNG, JPEG or WebP image");
      if (f.size > maxBytes) return setError(`Image must be ${maxBytes / (1024 * 1024)} MB or smaller`);
      setFile(f);
      setRemoved(false);
      setDirty(true);
    },
    remove() {
      setFile(null);
      setRemoved(true);
      setDirty(true);
    },
    /** Upload or delete as picked; resolves to an error message or null. */
    async commit(ownerId: string, kind: string): Promise<string | null> {
      if (!dirty) return null;
      const url = `/api/admin/clients/offers/images/${ownerId}/${kind}`;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(url, { method: "POST", body: fd });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          return json?.error ?? `Image upload failed (HTTP ${res.status})`;
        }
      } else if (removed) {
        const res = await fetch(url, { method: "DELETE" });
        if (!res.ok) return `Couldn't remove the image (HTTP ${res.status})`;
      }
      setDirty(false);
      return null;
    },
  };
}

/** Upload / Replace / Remove control for one image of a useImageDraft. */
export function ImageField({
  label,
  hint,
  draft,
  wide,
  onChange,
}: {
  label: string;
  hint: string;
  draft: ReturnType<typeof useImageDraft>;
  wide?: boolean;
  /** Told about a pick/removal (e.g. to mark a form dirty). */
  onChange?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        {draft.previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={draft.previewUrl}
            alt=""
            className={wide ? "h-10 w-20 rounded-md object-cover ring-1 ring-border" : "h-10 w-10 rounded-md bg-white object-contain p-0.5 ring-1 ring-border"}
          />
        )}
        <label className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/50">
          <Upload className="h-4 w-4" />
          {draft.previewUrl ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              draft.pick(e.target.files?.[0]);
              onChange?.();
              e.target.value = "";
            }}
          />
        </label>
        {draft.previewUrl && (
          <button
            type="button"
            onClick={() => {
              draft.remove();
              onChange?.();
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Remove
          </button>
        )}
      </div>
      <span className="block text-xs text-muted-foreground">{draft.error ?? hint}</span>
    </div>
  );
}
