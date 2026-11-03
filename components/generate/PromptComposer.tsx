"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent, type RefObject } from "react";
import { ArrowUp, GitBranch, ImagePlus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_REFERENCE_IMAGES } from "./imagePrep";

export interface ComposerAttachment {
  id: string;
  name: string;
  /** Small data-URL preview. */
  thumb: string;
  width: number;
  height: number;
}

const TEXTAREA_MAX_PX = 200;

// Client-only module (Creative Studio loads it with ssr:false).
const SEND_SHORTCUT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? "⌘↵"
    : "Ctrl+↵";

export function PromptComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  pending,
  maxChars,
  placeholder,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  baseImage,
  onClearBaseImage,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  pending: boolean;
  maxChars: number;
  placeholder: string;
  attachments: ComposerAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  /** "Continue from this image" (a branch) — shown as a removable chip. */
  baseImage: { url: string | null; label: string } | null;
  onClearBaseImage: () => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  const overLimit = value.length > maxChars;
  const canSubmit = !!trimmed && !overLimit && !pending;
  const canAttach = attachments.length < MAX_REFERENCE_IMAGES;

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (canSubmit) onSubmit();
    } else if (e.key === "Escape" && pending) {
      e.preventDefault();
      onStop();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    // A copied image often comes with text/html too — keep the text paste only when there's real text.
    if (!e.clipboardData.getData("text/plain")) e.preventDefault();
    onAddFiles(files);
  }

  return (
    // Below lg the panel itself scrolls; the composer stays stuck to its bottom.
    <div className="sticky bottom-0 z-[5] shrink-0 rounded-b-[inherit] border-t bg-card p-3 md:p-4 lg:static">
      {(baseImage || attachments.length > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {baseImage && (
            <span className="inline-flex h-12 items-center gap-2 rounded-2xl bg-muted py-1 pl-1 pr-1.5 text-xs">
              {baseImage.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL
                <img src={baseImage.url} alt="" className="size-10 rounded-xl object-cover" />
              ) : (
                <GitBranch className="ml-2 size-4 text-muted-foreground" />
              )}
              <span className="max-w-[12rem] truncate font-medium">{baseImage.label}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Don't continue from this image"
                onClick={onClearBaseImage}
              >
                <X />
              </Button>
            </span>
          )}
          {attachments.map((a) => (
            <span key={a.id} className="group relative size-12 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail */}
              <img
                src={a.thumb}
                alt={a.name}
                title={`${a.name} · ${a.width}×${a.height}`}
                className="size-12 rounded-xl object-cover ring-1 ring-foreground/10"
              />
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => onRemoveAttachment(a.id)}
                // 20px badge, 28px hit area (the ::after extends it).
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow outline-none after:absolute after:-inset-1 focus-visible:ring-[3px] focus-visible:ring-ring/30"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-3xl bg-input/50 transition-shadow focus-within:ring-[3px] focus-within:ring-ring/30">
        <Textarea
          ref={textareaRef}
          value={value}
          rows={1}
          onChange={(e) => {
            onChange(e.target.value);
            resize(e.target);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          aria-label="Prompt"
          aria-invalid={overLimit || undefined}
          className="max-h-[200px] min-h-[52px] bg-transparent px-4 pb-1 pt-3.5 focus-visible:border-transparent focus-visible:ring-0"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add reference images"
            title={canAttach ? "Add reference images (or paste / drop them)" : `Up to ${MAX_REFERENCE_IMAGES} images`}
            disabled={!canAttach}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus />
          </Button>
          {attachments.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {attachments.length}/{MAX_REFERENCE_IMAGES} images
            </span>
          )}
          <span className="flex-1" />
          {value.length >= maxChars * 0.9 && (
            <span className={cn("text-xs tabular-nums", overLimit ? "text-destructive" : "text-muted-foreground")}>
              {value.length.toLocaleString("en-US")} / {maxChars.toLocaleString("en-US")}
            </span>
          )}
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {pending ? "Esc to stop" : `${SEND_SHORTCUT} to send`}
          </span>
          {pending ? (
            <Button type="button" variant="secondary" size="icon-sm" aria-label="Stop generating" onClick={onStop}>
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button type="button" size="icon-sm" aria-label="Generate" disabled={!canSubmit} onClick={onSubmit}>
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Images generated by Google Gemini. Results may vary.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onAddFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
