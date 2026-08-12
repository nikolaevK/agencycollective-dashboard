"use client";

import { useRef, useState } from "react";
import { Paperclip, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE,
  MAX_TOTAL_ATTACHMENT_SIZE,
  BLOCKED_ATTACHMENT_EXTS,
  attachmentExtension,
  formatAttachmentBytes,
} from "@/lib/invoice/attachments";

export interface EmailAttachmentsState {
  attachments: File[];
  attachError: string | null;
  addFiles: (picked: FileList | null) => void;
  removeAt: (i: number) => void;
  clear: () => void;
}

/**
 * Free-form email attachments picked for an invoice send (transient — sent
 * with the email, never filed in Documents). Limits mirror the server's
 * readEmailAttachments (which stays authoritative); rejecting here just gives
 * feedback while the picker is still open.
 */
export function useEmailAttachments(): EmailAttachmentsState {
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);

  // Add files from the picker. We APPEND (never replace) so repeated clicks
  // build up the list.
  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setAttachError(null);
    const incoming = Array.from(picked);
    const next: File[] = [...attachments];
    let runningTotal = next.reduce((s, f) => s + f.size, 0);
    for (const f of incoming) {
      if (next.length >= MAX_ATTACHMENT_COUNT) {
        setAttachError(`Max ${MAX_ATTACHMENT_COUNT} attachments.`);
        break;
      }
      // 0-byte files (e.g. still-syncing cloud placeholders) would be shown
      // as attached but silently dropped by the server — reject up-front.
      if (f.size === 0) {
        setAttachError(`"${f.name}" is empty (0 bytes).`);
        continue;
      }
      const ext = attachmentExtension(f.name);
      if (ext && BLOCKED_ATTACHMENT_EXTS.has(ext)) {
        setAttachError(`"${f.name}" — .${ext} files aren't allowed.`);
        continue;
      }
      if (f.size > MAX_ATTACHMENT_SIZE) {
        setAttachError(
          `"${f.name}" exceeds ${formatAttachmentBytes(MAX_ATTACHMENT_SIZE)}.`
        );
        continue;
      }
      if (runningTotal + f.size > MAX_TOTAL_ATTACHMENT_SIZE) {
        setAttachError(
          `Total attachments would exceed ${formatAttachmentBytes(MAX_TOTAL_ATTACHMENT_SIZE)}.`
        );
        break;
      }
      // De-dupe by (name, size) — picking the same file twice in one open
      // shouldn't double it. Different files with the same name + size will
      // collide here too, but that's a very rare collision for a small list.
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
      runningTotal += f.size;
    }
    setAttachments(next);
  }

  function removeAt(i: number) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
    setAttachError(null);
  }

  function clear() {
    setAttachments([]);
    setAttachError(null);
  }

  return { attachments, attachError, addFiles, removeAt, clear };
}

/**
 * The attachments field UI: header with a running count/size, chip list with
 * per-file remove, and an add button driving a hidden file input. The input
 * value is reset after every pick so choosing the same file again — e.g.
 * after removing it — still fires the onChange.
 */
export function AttachmentPicker({ state }: { state: EmailAttachmentsState }) {
  const { attachments, attachError, addFiles, removeAt } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachTotal = attachments.reduce((s, f) => s + f.size, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Attachments (optional)
        </label>
        <span className="text-[11px] text-muted-foreground">
          {attachments.length}/{MAX_ATTACHMENT_COUNT} ·{" "}
          {formatAttachmentBytes(attachTotal)}/
          {formatAttachmentBytes(MAX_TOTAL_ATTACHMENT_SIZE)}
        </span>
      </div>
      <div className="rounded-lg border bg-background p-2 space-y-2">
        {attachments.length > 0 && (
          <ul className="space-y-1.5">
            {attachments.map((f, i) => (
              <li
                key={`${f.name}-${f.size}-${i}`}
                className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 text-xs text-foreground truncate">
                  {f.name}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatAttachmentBytes(f.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove ${f.name}`}
                  className="p-0.5 rounded hover:bg-background/60 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENT_COUNT}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors",
              attachments.length >= MAX_ATTACHMENT_COUNT && "opacity-50"
            )}
          >
            <Plus className="h-3 w-3" />
            Add file{attachments.length === 0 ? "s" : ""}
          </button>
          {attachments.length === 0 && (
            <span className="text-[11px] text-muted-foreground">
              Max {MAX_ATTACHMENT_COUNT} files,{" "}
              {formatAttachmentBytes(MAX_ATTACHMENT_SIZE)} each. No .exe/.js/etc.
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
      </div>
      {attachError && (
        <p className="mt-1.5 text-[11px] text-destructive">{attachError}</p>
      )}
    </div>
  );
}
