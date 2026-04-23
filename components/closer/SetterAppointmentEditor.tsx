"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/components/closer/CalendarEventList";
import type {
  AppointmentRecord,
  PostCallStatus,
  PreCallStatus,
} from "@/lib/appointments";
import {
  PRE_CALL_LABELS,
  POST_CALL_LABELS,
  PRE_CALL_STATUSES,
  POST_CALL_STATUSES,
} from "@/lib/appointments";

interface Props {
  event: CalendarEvent;
  appointment: AppointmentRecord;
  onClose: () => void;
  onSaved: () => void;
}

const INPUT_CLS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

export function SetterAppointmentEditor({ event, appointment, onClose, onSaved }: Props) {
  const [preCallStatus, setPreCallStatus] = useState<PreCallStatus>(appointment.preCallStatus);
  const [postCallStatus, setPostCallStatus] = useState<PostCallStatus>(appointment.postCallStatus);
  const [clientName, setClientName] = useState(appointment.clientName ?? "");
  const [clientEmail, setClientEmail] = useState(appointment.clientEmail ?? "");
  const [notes, setNotes] = useState(appointment.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreCallStatus(appointment.preCallStatus);
    setPostCallStatus(appointment.postCallStatus);
    setClientName(appointment.clientName ?? "");
    setClientEmail(appointment.clientEmail ?? "");
    setNotes(appointment.notes ?? "");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4 rounded-t-2xl">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate">Edit Appointment</h3>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{event.title}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Pre-call status</label>
              <select
                value={preCallStatus}
                onChange={(e) => setPreCallStatus(e.target.value as PreCallStatus)}
                className={INPUT_CLS}
              >
                {PRE_CALL_STATUSES.map((v) => (
                  <option key={v} value={v}>{PRE_CALL_LABELS[v]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Post-call status</label>
              <select
                value={postCallStatus}
                onChange={(e) => setPostCallStatus(e.target.value as PostCallStatus)}
                className={INPUT_CLS}
              >
                {POST_CALL_STATUSES.map((v) => (
                  <option key={v} value={v}>{POST_CALL_LABELS[v]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Client name</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Optional"
                className={INPUT_CLS}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Client email</label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="Optional"
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the closer should know before the call"
              rows={4}
              className={cn(INPUT_CLS, "h-auto py-2")}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 rounded-lg ac-gradient px-5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
