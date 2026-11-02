"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/use-confirm";
import { STAGE_OPTIONS, HEALTH_OPTIONS } from "@/lib/clientProfile";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import type { RosterOption, RosterOptionKind } from "@/lib/rosterOptions";

const KIND_COPY: Record<
  RosterOptionKind,
  { title: string; placeholder: string; builtins: ReadonlyArray<RosterOption> }
> = {
  stage: {
    title: "Stage options",
    placeholder: "Add a stage option…",
    builtins: STAGE_OPTIONS,
  },
  health: {
    title: "Client health options",
    placeholder: "Add a health option…",
    builtins: HEALTH_OPTIONS,
  },
};

/**
 * Manage the roster Stage / Client Health chip vocabulary — the sibling of
 * AdPlatformOptionsModal, parameterized by kind. Built-ins are permanent;
 * admins can add, rename, and remove their own options. Removing an option
 * leaves any client already tagged with it untouched — it just disappears
 * from the picker.
 */
export function RosterOptionsModal({
  kind,
  onClose,
}: {
  kind: RosterOptionKind;
  onClose: () => void;
}) {
  const { customOptions, addOption, renameOption, removeOption } =
    useRosterOptions(kind);
  const copy = KIND_COPY[kind];
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        // The old modal had no Escape handler — it closes only via the X
        // button or a backdrop click (Escape in a rename field cancels the
        // rename only).
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-14">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            Shared across every client&apos;s roster row.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-6">
          {error && (
            <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
              {error}
            </div>
          )}

          {/* Add */}
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder={copy.placeholder}
              maxLength={40}
              disabled={busy}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              onClick={handleAdd}
              disabled={busy || !draft.trim()}
            >
              <Plus />
              Add
            </Button>
          </div>

          {/* List */}
          <div className="space-y-1.5">
            {copy.builtins.map((o) => (
              <div
                key={o.value}
                className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2"
              >
                <span className="text-sm font-medium">{o.label}</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3" />
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
      </DialogContent>
    </Dialog>
  );
}

function CustomOptionRow({
  option,
  busy,
  onRename,
  onRemove,
}: {
  option: RosterOption;
  busy: boolean;
  onRename: (label: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(option.label);
  const { confirm, dialog } = useConfirm();

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
    <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 ring-1 ring-foreground/5">
      {editing ? (
        <Input
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
          aria-label="Option name"
          className="h-8 min-w-0 flex-1"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {option.label}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={save}
            disabled={busy}
            aria-label="Save name"
            title="Save name"
          >
            <Check />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditing(true)}
            disabled={busy}
            aria-label="Rename option"
            title="Rename option"
            className="text-muted-foreground"
          >
            <Pencil />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={async () => {
            if (
              await confirm({
                title: `Remove "${option.label}"?`,
                description: "Clients already tagged with it keep the tag.",
                confirmText: "Remove",
                destructive: true,
              })
            )
              onRemove();
          }}
          disabled={busy}
          aria-label="Remove option"
          title="Remove option"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </div>
      {dialog}
    </div>
  );
}
