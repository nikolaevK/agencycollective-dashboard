"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Pencil, Check, X, DollarSign } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCents } from "@/components/closers/types";

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
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="number"
            step="1"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <p className="text-xl sm:text-2xl font-bold text-foreground">
        {formatCents(currentQuota)}
      </p>
      <button
        onClick={() => setEditing(true)}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}
