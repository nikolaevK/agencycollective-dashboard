"use client";

import { useState, useTransition } from "react";
import { DollarSign, Calendar, Tag, FileText, Send } from "lucide-react";
import { ClientAutocomplete } from "./ClientAutocomplete";
import { createDealAction } from "@/app/actions/closerDeals";
import { SERVICE_CATEGORIES, DEAL_STATUSES } from "@/components/closers/types";

const INPUT_CLS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-shadow";

interface Props {
  onSuccess?: () => void;
}

export function DealEntryForm({ onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const [clientName, setClientName] = useState("");
  const [clientUserId, setClientUserId] = useState<string | null>(null);
  const [dealValue, setDealValue] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [status, setStatus] = useState("closed");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const fd = new FormData();
    fd.set("clientName", clientName);
    if (clientUserId) fd.set("clientUserId", clientUserId);
    fd.set("dealValue", dealValue);
    fd.set("closingDate", closingDate);
    fd.set("serviceCategory", serviceCategory);
    fd.set("status", status);
    fd.set("notes", notes);

    startTransition(async () => {
      const result = await createDealAction(fd);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setClientName("");
        setClientUserId(null);
        setDealValue("");
        setClosingDate("");
        setServiceCategory("");
        setStatus("closed");
        setNotes("");
        onSuccess?.();
      }
    });
  }

  function handleDiscard() {
    setClientName("");
    setClientUserId(null);
    setDealValue("");
    setClosingDate("");
    setServiceCategory("");
    setStatus("closed");
    setNotes("");
    setError(null);
    setSuccess(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Client Name with autocomplete */}
      <ClientAutocomplete
        clientName={clientName}
        onClientNameChange={setClientName}
        clientUserId={clientUserId}
        onClientUserIdChange={setClientUserId}
      />

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
            className={`${INPUT_CLS} pl-10`}
          />
        </div>
      </div>

      {/* Closing Date */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Closing Date</label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={closingDate}
            onChange={(e) => setClosingDate(e.target.value)}
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

      {/* Deal Status */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={INPUT_CLS}
        >
          {DEAL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Strategic Notes</label>
        <div className="relative">
          <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about this deal..."
            rows={3}
            className="flex w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-shadow resize-none"
          />
        </div>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">Deal recorded successfully!</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleDiscard}
          className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          Discard
        </button>
        <button
          type="submit"
          disabled={isPending || !clientName.trim() || !dealValue}
          className="relative h-10 flex-1 inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg px-4 text-sm font-semibold text-white transition-opacity disabled:pointer-events-none disabled:opacity-50 ac-gradient"
        >
          {isPending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
              Submitting...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit Entry
            </>
          )}
        </button>
      </div>
    </form>
  );
}
