"use client";

import { useState, useTransition } from "react";
import { X, DollarSign, Tag, FileText, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ClientAutocomplete } from "./ClientAutocomplete";
import { SERVICE_CATEGORIES, DEAL_STATUSES } from "@/components/closers/types";
import type { CalendarEvent } from "./CalendarEventList";

const INPUT_CLS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-shadow";

interface Props {
  event: CalendarEvent;
  onClose: () => void;
}

export function LinkEventDealModal({ event, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const [clientName, setClientName] = useState(event.title);
  const [clientUserId, setClientUserId] = useState<string | null>(null);
  const [dealValue, setDealValue] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [status, setStatus] = useState("closed");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Extract date from event
  const eventDate = event.start.slice(0, 10); // YYYY-MM-DD

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!dealValue || parseFloat(dealValue) <= 0) {
      setError("Deal value is required");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/closer/calendar/link-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          eventTitle: clientName || event.title,
          eventDate,
          dealValue: parseFloat(dealValue),
          serviceCategory: serviceCategory || null,
          status,
          notes: notes || null,
          clientUserId,
        }),
      });

      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
        queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
        queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Link as Deal</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create a deal from &ldquo;{event.title}&rdquo;
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Client Name */}
          <ClientAutocomplete
            clientName={clientName}
            onClientNameChange={setClientName}
            clientUserId={clientUserId}
            onClientUserIdChange={setClientUserId}
          />

          {/* Event date (read-only) */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Closing Date</label>
            <input
              type="date"
              value={eventDate}
              readOnly
              className={`${INPUT_CLS} bg-muted/50`}
            />
          </div>

          {/* Deal Value */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Deal Value (USD)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="number"
                step="0.01"
                min="0"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="0.00"
                required
                autoFocus
                className={`${INPUT_CLS} pl-10`}
              />
            </div>
          </div>

          {/* Service Category */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Service Category</label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <select
                value={serviceCategory}
                onChange={(e) => setServiceCategory(e.target.value)}
                className={`${INPUT_CLS} pl-10 appearance-none`}
              >
                <option value="">Select category...</option>
                {SERVICE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={INPUT_CLS}>
              {DEAL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Notes</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes..."
                rows={2}
                className="flex w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Footer */}
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
              disabled={isPending || !dealValue}
              className="h-9 inline-flex items-center gap-2 rounded-lg ac-gradient px-4 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            >
              {isPending ? "Creating..." : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Create Deal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
