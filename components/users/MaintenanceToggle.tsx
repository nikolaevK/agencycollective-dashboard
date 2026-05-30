"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench, X, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const MESSAGE_MAX = 500;
const DEFAULT_MESSAGE =
  "We're performing scheduled maintenance on the portal. Some features may be temporarily unavailable — thank you for your patience.";

interface MaintenanceConfig {
  enabled: boolean;
  message: string;
}

async function fetchMaintenance(): Promise<MaintenanceConfig> {
  const res = await fetch("/api/admin/clients/maintenance");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as MaintenanceConfig;
}

/**
 * Compact button (lives next to the Client Directory tabs) that opens a modal
 * to toggle client-portal maintenance mode and edit the message clients see.
 */
export function MaintenanceToggle() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-maintenance"],
    queryFn: fetchMaintenance,
    staleTime: 60_000,
  });

  const enabled = data?.enabled ?? false;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Client portal maintenance mode"
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
          enabled
            ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Wrench className="h-4 w-4" />
        <span className="hidden sm:inline">Maintenance</span>
        <span
          className={cn(
            "inline-flex h-2 w-2 rounded-full",
            enabled ? "bg-amber-500" : "bg-muted-foreground/40"
          )}
          aria-hidden
        />
        <span className="sr-only">{enabled ? "on" : "off"}</span>
      </button>

      {open && (
        <MaintenanceModal
          initial={data ?? { enabled: false, message: "" }}
          onClose={() => setOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-maintenance"] });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function MaintenanceModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: MaintenanceConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [message, setMessage] = useState(initial.message);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the form in sync if the underlying config loads/changes while open.
  useEffect(() => {
    setEnabled(initial.enabled);
    setMessage(initial.message);
  }, [initial.enabled, initial.message]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clients/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, message: message.slice(0, MESSAGE_MAX) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative mt-16 w-full max-w-lg rounded-2xl border border-border/50 bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-amber-500" />
            <h2 className="text-base font-bold text-foreground">Portal maintenance mode</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-foreground">Maintenance mode</div>
              <p className="text-xs text-muted-foreground">
                Shows a notice across all client portal pages. The portal stays fully usable.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Maintenance mode"
              onClick={() => setEnabled((v) => !v)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                enabled ? "bg-amber-500" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                  enabled ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          {/* Message */}
          <div>
            <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-foreground">
              <span>Message shown to clients</span>
              <span className="tabular-nums text-muted-foreground">
                {message.length}/{MESSAGE_MAX}
              </span>
            </label>
            <textarea
              value={message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder={DEFAULT_MESSAGE}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Leave blank to use the default message.
            </p>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/40">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Preview
            </div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              {message.trim() || DEFAULT_MESSAGE}
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border/50 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
