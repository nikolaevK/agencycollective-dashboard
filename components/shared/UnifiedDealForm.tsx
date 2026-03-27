"use client";

import { useState, useTransition } from "react";
import { DollarSign, Calendar, Tag, FileText, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ClientAutocomplete } from "@/components/closer/ClientAutocomplete";
import { ServiceMultiSelect } from "@/components/shared/ServiceMultiSelect";
import { INDUSTRIES, DEAL_STATUSES } from "@/components/closers/types";
import { parseServiceCategory, serializeServiceCategory } from "@/lib/serviceCategory";
import { createDealAction } from "@/app/actions/closerDeals";

const INPUT_CLS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-shadow";

interface UnifiedDealFormProps {
  mode: "create" | "edit";
  context: "closer" | "admin" | "calendar-link";
  initialData?: {
    id?: string;
    clientName?: string;
    clientUserId?: string | null;
    dealValue?: number; // cents
    closingDate?: string | null;
    serviceCategory?: string | null;
    industry?: string | null;
    status?: string;
    notes?: string | null;
    googleEventId?: string | null;
  };
  calendarEvent?: {
    id: string;
    title: string;
    date: string; // YYYY-MM-DD
  };
  readOnlyDate?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function UnifiedDealForm({
  mode,
  context,
  initialData,
  calendarEvent,
  readOnlyDate,
  onSuccess,
  onCancel,
}: UnifiedDealFormProps) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const [clientName, setClientName] = useState(initialData?.clientName ?? calendarEvent?.title ?? "");
  const [clientUserId, setClientUserId] = useState<string | null>(initialData?.clientUserId ?? null);
  const [dealValue, setDealValue] = useState(
    initialData?.dealValue ? String(initialData.dealValue / 100) : ""
  );
  const [closingDate, setClosingDate] = useState(
    initialData?.closingDate ?? calendarEvent?.date ?? ""
  );
  const [selectedServices, setSelectedServices] = useState<string[]>(
    parseServiceCategory(initialData?.serviceCategory ?? null)
  );
  const [industry, setIndustry] = useState(initialData?.industry ?? "");
  const [status, setStatus] = useState(initialData?.status ?? "closed");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const googleEventId = calendarEvent?.id ?? initialData?.googleEventId ?? null;

  function resetForm() {
    setClientName("");
    setClientUserId(null);
    setDealValue("");
    setClosingDate("");
    setSelectedServices([]);
    setIndustry("");
    setStatus("closed");
    setNotes("");
    setError(null);
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validation
    if (!clientName.trim()) {
      setError("Client name is required");
      return;
    }
    if (status !== "not_closed") {
      const dv = parseFloat(dealValue) || 0;
      if (dv <= 0) {
        setError("Deal value must be greater than 0");
        return;
      }
    }

    const serializedServices = serializeServiceCategory(selectedServices);

    // Auto-show: closed + calendar-linked = showed
    const autoShowStatus = status === "closed" && googleEventId ? "showed" : null;

    startTransition(async () => {
      try {
        if (context === "closer" && mode === "create") {
          // Server action
          const fd = new FormData();
          fd.set("clientName", clientName);
          if (clientUserId) fd.set("clientUserId", clientUserId);
          fd.set("dealValue", dealValue || "0");
          fd.set("closingDate", closingDate);
          fd.set("serviceCategory", serializedServices ?? "");
          fd.set("industry", industry);
          fd.set("status", status);
          fd.set("notes", notes);
          if (googleEventId) fd.set("googleEventId", googleEventId);
          if (autoShowStatus) fd.set("showStatus", autoShowStatus);

          const result = await createDealAction(fd);
          if (result.error) {
            setError(result.error);
            return;
          }
          setSuccess(true);
          resetForm();
          onSuccess?.();
        } else if (context === "calendar-link") {
          // POST to link-deal API
          const res = await fetch("/api/closer/calendar/link-deal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventId: calendarEvent?.id,
              eventTitle: clientName || calendarEvent?.title,
              eventDate: closingDate,
              dealValue: parseFloat(dealValue) || 0,
              serviceCategory: serializedServices,
              industry: industry || null,
              status,
              notes: notes || null,
              clientUserId,
            }),
          });
          const json = await res.json();
          if (json.error) {
            setError(json.error);
            return;
          }
          queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
          queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
          queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
          onSuccess?.();
        } else if (mode === "edit") {
          // PATCH to appropriate endpoint
          const endpoint = context === "admin" ? "/api/admin/deals" : "/api/closer/deals";
          const body: Record<string, unknown> = {
            id: initialData?.id,
            clientName,
            dealValue: parseFloat(dealValue) || 0,
            serviceCategory: serializedServices,
            industry: industry || null,
            closingDate: closingDate || null,
            status,
            notes: notes || null,
          };
          if (clientUserId !== undefined) body.clientUserId = clientUserId;
          if (autoShowStatus) body.showStatus = autoShowStatus;

          const res = await fetch(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          if (json.error) {
            setError(json.error);
            return;
          }
          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
          queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
          queryClient.invalidateQueries({ queryKey: ["closer-detail"] });
          queryClient.invalidateQueries({ queryKey: ["closers-stats"] });
          queryClient.invalidateQueries({ queryKey: ["admin-all-deals"] });
          queryClient.invalidateQueries({ queryKey: ["admin-all-deals-calendar"] });
          onSuccess?.();
        }
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  const showClientAutocomplete = (context === "closer" || context === "calendar-link") && mode === "create";
  const submitLabel =
    mode === "create"
      ? context === "calendar-link"
        ? "Create Deal"
        : "Submit Entry"
      : "Save Changes";
  const cancelLabel = mode === "create" && context === "closer" ? "Discard" : "Cancel";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Client Name */}
      {showClientAutocomplete ? (
        <ClientAutocomplete
          clientName={clientName}
          onClientNameChange={setClientName}
          clientUserId={clientUserId}
          onClientUserIdChange={setClientUserId}
        />
      ) : (
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Client Name</label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            required
            className={INPUT_CLS}
          />
        </div>
      )}

      {/* Status */}
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

      {/* Deal Value — hidden when not_closed */}
      {status !== "not_closed" && (
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
      )}

      {/* Closing Date */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Closing Date</label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={closingDate}
            onChange={(e) => setClosingDate(e.target.value)}
            readOnly={readOnlyDate}
            className={`${INPUT_CLS} pl-10 ${readOnlyDate ? "bg-muted/50" : ""}`}
          />
        </div>
      </div>

      {/* Services Purchased (multi-select) */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Services Purchased</label>
        <ServiceMultiSelect value={selectedServices} onChange={setSelectedServices} />
      </div>

      {/* Industry */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Industry</label>
        <div className="relative">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className={`${INPUT_CLS} pl-10 appearance-none`}
          >
            <option value="">Select industry...</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>
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
      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {cancelLabel}
          </button>
        )}
        {!onCancel && mode === "create" && (
          <button
            type="button"
            onClick={resetForm}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || !clientName.trim() || (status !== "not_closed" && !dealValue)}
          className="h-9 inline-flex items-center gap-2 rounded-lg ac-gradient px-4 text-sm font-semibold text-white disabled:opacity-50 disabled:pointer-events-none transition-opacity"
        >
          {isPending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
              {mode === "edit" ? "Saving..." : "Submitting..."}
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              {submitLabel}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
