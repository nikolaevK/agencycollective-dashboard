"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeDot, badgeTone, badgeToneHover } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Client portal maintenance mode"
        className={cn(enabled ? [badgeTone.warning, badgeToneHover.warning] : "text-muted-foreground")}
      >
        <Wrench />
        <span className="hidden sm:inline">Maintenance</span>
        <BadgeDot tone={enabled ? "warning" : "neutral"} className={cn(!enabled && "opacity-40")} />
        <span className="sr-only">{enabled ? "on" : "off"}</span>
      </Button>

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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        // The old modal had no Escape handler — it closes only via the X
        // button, Cancel or a backdrop click.
        onEscapeKeyDown={(e) => e.preventDefault()}
        // Focus the message, not the on/off switch — a stray Space must not
        // flip maintenance mode the moment the dialog opens.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById("maintenance-message")?.focus();
        }}
        aria-describedby={undefined}
        // Scrolls on short screens (e.g. a phone in landscape).
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader className="pr-10">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" />
            Portal maintenance mode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Toggle */}
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Maintenance mode</div>
              <p className="text-xs text-muted-foreground">
                Shows a notice across all client portal pages. The portal stays fully usable.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v)}
              aria-label="Maintenance mode"
            />
          </label>

          {/* Message */}
          <div className="grid gap-2">
            <Label htmlFor="maintenance-message" className="justify-between">
              <span>Message shown to clients</span>
              <span className="font-normal tabular-nums text-muted-foreground">
                {message.length}/{MESSAGE_MAX}
              </span>
            </Label>
            <Textarea
              id="maintenance-message"
              value={message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder={DEFAULT_MESSAGE}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the default message.
            </p>
          </div>

          {/* Live preview */}
          <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.warning)}>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle className="size-3.5" />
              Preview
            </div>
            <p className="font-medium">
              {message.trim() || DEFAULT_MESSAGE}
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
