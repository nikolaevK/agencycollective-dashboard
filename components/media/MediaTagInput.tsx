"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MAX_TAGS, MAX_TAG_LEN } from "./mediaDirectoryShared";

/** Chips + free-text input for editing a list of tags (kit Input look). */
export function MediaTagInput({
  tags,
  onChange,
  placeholder = "Add tags…",
  autoFocus,
  className,
  "aria-label": ariaLabel = "Tags",
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const parts = raw.split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
    const next = [...tags];
    for (const p of parts) {
      const tag = p.slice(0, MAX_TAG_LEN);
      if (tag && next.length < MAX_TAGS && !next.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        next.push(tag);
      }
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div
      className={cn(
        "flex min-h-8 flex-wrap items-center gap-1 rounded-3xl border border-transparent bg-input/50 px-2 py-1 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
        className
      )}
    >
      {tags.map((t) => (
        <Badge key={t} variant="secondary" className="max-w-full gap-0.5 pr-1">
          <span className="truncate">{t}</span>
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={`Remove ${t}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(draft); }
          else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => { if (draft.trim()) commit(draft); }}
        placeholder={tags.length === 0 ? placeholder : ""}
        aria-label={ariaLabel}
        className="min-w-[70px] flex-1 bg-transparent px-1 py-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
      />
    </div>
  );
}
