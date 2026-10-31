"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CalendarEvent } from "@/components/closer/CalendarEventList";
import type {
  AppointmentRecord,
  PostCallStatus,
  PreCallStatus,
  SetterTier,
} from "@/lib/appointments";
import {
  PRE_CALL_LABELS,
  POST_CALL_LABELS,
  PRE_CALL_STATUSES,
  POST_CALL_STATUSES,
  SETTER_TIERS,
  SETTER_TIER_LABELS,
  SETTER_TIER_PAYOUT_HINT,
} from "@/lib/appointmentRules";

interface Props {
  event: CalendarEvent;
  appointment: AppointmentRecord;
  onClose: () => void;
  onSaved: () => void;
}

// RadioGroup values are strings — "no tier" (null) maps to this sentinel.
const NO_TIER = "__none__";

export function SetterAppointmentEditor({ event, appointment, onClose, onSaved }: Props) {
  const [preCallStatus, setPreCallStatus] = useState<PreCallStatus>(appointment.preCallStatus);
  const [postCallStatus, setPostCallStatus] = useState<PostCallStatus>(appointment.postCallStatus);
  const [clientName, setClientName] = useState(appointment.clientName ?? "");
  const [clientEmail, setClientEmail] = useState(appointment.clientEmail ?? "");
  const [notes, setNotes] = useState(appointment.notes ?? "");
  // `null` here means "no tier selected → no setter credit on the linked
  // deal" per Section 3 of the 1099 contract. `undefined` is never used
  // here; we always pass an explicit value to the API.
  const [setterTier, setSetterTier] = useState<SetterTier | null>(appointment.setterTier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreCallStatus(appointment.preCallStatus);
    setPostCallStatus(appointment.postCallStatus);
    setClientName(appointment.clientName ?? "");
    setClientEmail(appointment.clientEmail ?? "");
    setNotes(appointment.notes ?? "");
    setSetterTier(appointment.setterTier);
    setError(null);
  }, [appointment]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/closer/setter/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleEventId: event.id,
          clientName,
          clientEmail,
          notes,
          preCallStatus,
          postCallStatus,
          // Only send the tier when it actually changed. The route re-runs
          // deal attribution whenever setterTier is present in the body, so
          // including the unchanged value on a notes-only save would re-run
          // it on every edit. (undefined keys are dropped by JSON.stringify.)
          ...(setterTier !== appointment.setterTier ? { setterTier } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to save");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="truncate">Edit Appointment</DialogTitle>
          <DialogDescription className="truncate">{event.title}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="setter-appt-pre-call">Pre-call status</Label>
              <Select
                value={preCallStatus}
                onValueChange={(v) => setPreCallStatus(v as PreCallStatus)}
              >
                <SelectTrigger id="setter-appt-pre-call">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRE_CALL_STATUSES.map((v) => (
                    <SelectItem key={v} value={v}>{PRE_CALL_LABELS[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="setter-appt-post-call">Post-call status</Label>
              <Select
                value={postCallStatus}
                onValueChange={(v) => setPostCallStatus(v as PostCallStatus)}
              >
                <SelectTrigger id="setter-appt-post-call">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_CALL_STATUSES.map((v) => (
                    <SelectItem key={v} value={v}>{POST_CALL_LABELS[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="setter-appt-client-name">Client name</Label>
              <Input
                id="setter-appt-client-name"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="setter-appt-client-email">Client email</Label>
              <Input
                id="setter-appt-client-email"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="setter-appt-notes">Notes</Label>
            <Textarea
              id="setter-appt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the closer should know before the call"
              rows={4}
            />
          </div>

          {/* ── 1099 commission tier ──────────────────────────────────
              Setter declares which tier this appointment falls under per
              Section 3.3 of the contract. Until a tier is selected, the
              setter is NOT credited on any deal that links to this event.
              Picking a tier acts as the explicit "approve attribution"
              consent the contract requires. */}
          <div className="space-y-2 rounded-2xl bg-muted/50 p-4">
            <p id="setter-appt-tier-label" className="text-sm font-medium text-foreground">Commission tier</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pick the tier that best describes your contribution. Selecting a
              tier credits you on any closed deal linked to this call. Leave
              unselected if you weren&apos;t the source of this appointment.
            </p>
            <RadioGroup
              name="setter-tier"
              aria-labelledby="setter-appt-tier-label"
              value={setterTier ?? NO_TIER}
              onValueChange={(v) => setSetterTier(v === NO_TIER ? null : (v as SetterTier))}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1"
            >
              <label
                className={cn(
                  "flex items-start gap-2.5 rounded-2xl bg-background px-3 py-2.5 ring-1 ring-foreground/10 cursor-pointer transition-colors hover:bg-muted",
                  setterTier === null && "ring-foreground/40"
                )}
              >
                <RadioGroupItem value={NO_TIER} className="mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">No tier</p>
                  <p className="text-xs text-muted-foreground">
                    I&apos;m not claiming credit on this appointment.
                  </p>
                </div>
              </label>
              {SETTER_TIERS.map((t) => (
                <label
                  key={t}
                  className={cn(
                    "flex items-start gap-2.5 rounded-2xl bg-background px-3 py-2.5 ring-1 ring-foreground/10 cursor-pointer transition-colors hover:bg-muted",
                    setterTier === t && "ring-foreground/40"
                  )}
                >
                  <RadioGroupItem value={t} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {SETTER_TIER_LABELS[t]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {SETTER_TIER_PAYOUT_HINT[t]}
                    </p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
