"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Pencil, Check, X, DollarSign } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCents } from "@/components/closers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface InlineQuotaEditorProps {
  currentQuota: number; // cents
}

export function InlineQuotaEditor({ currentQuota }: InlineQuotaEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentQuota / 100));
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Sync external changes
  useEffect(() => {
    if (!editing) {
      setValue(String(currentQuota / 100));
    }
  }, [currentQuota, editing]);

  function handleSave() {
    startTransition(async () => {
      const res = await fetch("/api/closer/quota", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quota: parseFloat(value) || 0 }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
        setEditing(false);
      }
    });
  }

  function handleCancel() {
    setValue(String(currentQuota / 100));
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  }

  if (editing) {
    return (
      // Wraps Save/Cancel under the field when the card is narrow (a half-
      // width phone card left the field ~2 digits wide).
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-28 flex-1">
          <DollarSign className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            className="h-8 pl-7 pr-2 font-semibold tabular-nums"
          />
        </div>
        <Button
          size="icon-sm"
          onClick={handleSave}
          disabled={isPending}
          aria-label="Save"
        >
          <Check />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCancel}
          disabled={isPending}
          aria-label="Cancel"
        >
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <p className="text-xl sm:text-2xl font-semibold tracking-tight tabular-nums">
        {formatCents(currentQuota)}
      </p>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setEditing(true)}
        aria-label="Edit"
        className="text-muted-foreground"
      >
        <Pencil />
      </Button>
    </div>
  );
}
