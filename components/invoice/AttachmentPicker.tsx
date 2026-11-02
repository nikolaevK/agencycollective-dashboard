"use client";

import { useRef, useState } from "react";
import { Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs text-muted-foreground">Attachments (optional)</Label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {attachments.length}/{MAX_ATTACHMENT_COUNT} ·{" "}
          {formatAttachmentBytes(attachTotal)}/
          {formatAttachmentBytes(MAX_TOTAL_ATTACHMENT_SIZE)}
        </span>
      </div>
      <div className="space-y-2 rounded-2xl bg-input/50 p-2">
        {attachments.length > 0 && (
          <ul className="space-y-1.5">
            {attachments.map((f, i) => (
              <li
                key={`${f.name}-${f.size}-${i}`}
                className="flex items-center gap-2 rounded-xl bg-background px-2.5 py-1.5 ring-1 ring-foreground/5"
              >
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {f.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatAttachmentBytes(f.size)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove ${f.name}`}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENT_COUNT}
          >
            <Plus />
            Add file{attachments.length === 0 ? "s" : ""}
          </Button>
          {attachments.length === 0 && (
            <span className="text-xs text-muted-foreground">
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
        <p className="text-xs text-destructive">{attachError}</p>
      )}
    </div>
  );
}
