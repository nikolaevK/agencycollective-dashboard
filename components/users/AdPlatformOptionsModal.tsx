"use client";

import { useState } from "react";
import { X, Plus, Pencil, Trash2, Check, Lock } from "lucide-react";
import { AD_PLATFORM_OPTIONS } from "@/lib/clientProfile";
import { useAdPlatformOptions } from "@/hooks/useAdPlatformOptions";
import type { PlatformOption } from "@/lib/adPlatformOptions";

/**
 * Manage the roster "Ad Platforms" chip vocabulary. The three built-ins
 * (Orange Trail / Concept / Personal) are permanent; admins can add, rename,
 * and remove their own options. Removing an option leaves any client already
 * tagged with it untouched — it just disappears from the picker.
 */
export function AdPlatformOptionsModal({ onClose }: { onClose: () => void }) {
  const { customOptions, addOption, renameOption, removeOption } =
    useAdPlatformOptions();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Returns whether the task succeeded, so callers can keep an editor open. */
  async function run(task: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await task();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const label = draft.trim();
    if (!label) return;
    await run(async () => {
      await addOption(label);
      setDraft("");
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative mt-16 w-full max-w-md rounded-2xl bg-card shadow-xl border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div>
            <h2 className="text-lg font-bold text-foreground">Ad platform options</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shared across every client&apos;s roster row.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Add */}
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="Add a platform option…"
              maxLength={40}
              disabled={busy}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          {/* List */}
          <div className="space-y-1.5">
            {AD_PLATFORM_OPTIONS.map((o) => (
              <div
                key={o.value}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3 py-2"
              >
                <span className="text-sm font-medium text-foreground">{o.label}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Built-in
                </span>
              </div>
            ))}

            {customOptions.map((o) => (
              <CustomOptionRow
                key={o.value}
                option={o}
                busy={busy}
                onRename={(label) => run(() => renameOption(o.value, label))}
                onRemove={() => run(() => removeOption(o.value))}
              />
            ))}

            {customOptions.length === 0 && (
              <p className="px-1 pt-1 text-xs text-muted-foreground">
                No custom options yet. Built-ins above are always available.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomOptionRow({
  option,
  busy,
  onRename,
  onRemove,
}: {
  option: PlatformOption;
  busy: boolean;
  onRename: (label: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(option.label);

  async function save() {
    const next = label.trim();
    if (!next || next === option.label) {
      setEditing(false);
      setLabel(option.label);
      return;
    }
    // Keep the editor open if the rename was rejected (e.g. duplicate name) so
    // the typed value + error stay visible and fixable.
    if (await onRename(next)) setEditing(false);
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background px-3 py-2">
      {editing ? (
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") {
              setEditing(false);
              setLabel(option.label);
            }
          }}
          maxLength={40}
          disabled={busy}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:border-primary disabled:opacity-50"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {option.label}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40"
            aria-label="Save name"
          >
            <Check className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
            aria-label="Rename option"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm(`Remove "${option.label}"? Clients already tagged with it keep the tag.`))
              onRemove();
          }}
          disabled={busy}
          className="p-1.5 rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-40"
          aria-label="Remove option"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
