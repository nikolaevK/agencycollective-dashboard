"use client";

import { useState, useTransition } from "react";
import { DollarSign, Calendar, Tag, FileText, Send, Building2, Globe, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ClientAutocomplete } from "@/components/closer/ClientAutocomplete";
import { ServiceMultiSelect } from "@/components/shared/ServiceMultiSelect";
import { INDUSTRIES, DEAL_STATUSES, PAYMENT_TYPES } from "@/components/closers/types";
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
    clientEmail?: string | null;
    dealValue?: number; // cents
    closingDate?: string | null;
    serviceCategory?: string | null;
    industry?: string | null;
    status?: string;
    notes?: string | null;
    googleEventId?: string | null;
    paymentType?: string;
    brandName?: string | null;
    website?: string | null;
    additionalCcEmails?: string[];
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
  const [clientEmail, setClientEmail] = useState(initialData?.clientEmail ?? "");
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
  const [paymentType, setPaymentType] = useState(initialData?.paymentType ?? "local");
  const [brandName, setBrandName] = useState(initialData?.brandName ?? "");
  const [website, setWebsite] = useState(initialData?.website ?? "");
  const [additionalCcEmails, setAdditionalCcEmails] = useState<string[]>(initialData?.additionalCcEmails ?? []);
  const [ccInputValue, setCcInputValue] = useState("");
  const [ccInputError, setCcInputError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function tryCommitCc(raw: string): boolean {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254) {
      setCcInputError("Enter a valid email address");
      return false;
    }
    if (additionalCcEmails.includes(trimmed)) {
      setCcInputError("Already added");
      return false;
    }
    if (additionalCcEmails.length >= 10) {
      setCcInputError("Maximum 10 additional CCs");
      return false;
    }
    setAdditionalCcEmails((prev) => [...prev, trimmed]);
    setCcInputValue("");
    setCcInputError(null);
    return true;
  }

  function removeCc(email: string) {
    setAdditionalCcEmails((prev) => prev.filter((e) => e !== email));
    setCcInputError(null);
  }

  function commitCcBatch(tokens: string[]) {
    const next = [...additionalCcEmails];
    const seen = new Set(next);
    let firstError: string | null = null;
    for (const raw of tokens) {
      const v = raw.trim().toLowerCase();
      if (!v) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 254) {
        if (firstError === null) firstError = "Some entries were invalid and skipped";
        continue;
      }
      if (seen.has(v)) continue;
      if (next.length >= 10) {
        if (firstError === null) firstError = "Maximum 10 additional CCs";
        break;
      }
      next.push(v);
      seen.add(v);
    }
    if (next.length !== additionalCcEmails.length) setAdditionalCcEmails(next);
    setCcInputValue("");
    setCcInputError(firstError);
  }

  const googleEventId = calendarEvent?.id ?? initialData?.googleEventId ?? null;

  function resetForm() {
    setClientName("");
    setClientUserId(null);
    setClientEmail("");
    setDealValue("");
    setClosingDate("");
    setSelectedServices([]);
    setIndustry("");
    setStatus("closed");
    setNotes("");
    setPaymentType("local");
    setBrandName("");
    setWebsite("");
    setAdditionalCcEmails([]);
    setCcInputValue("");
    setCcInputError(null);
    setError(null);
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Commit any pending CC input (so typed-but-unconfirmed values aren't dropped)
    let ccList = additionalCcEmails;
    if (ccInputValue.trim()) {
      const pending = ccInputValue.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pending) || pending.length > 254) {
        setCcInputError("Enter a valid email address");
        return;
      }
      if (!ccList.includes(pending) && ccList.length < 10) {
        ccList = [...ccList, pending];
        setAdditionalCcEmails(ccList);
        setCcInputValue("");
        setCcInputError(null);
      }
    }

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

    // Admin downgrade guard: changing a deal from a visible status
    // (closed / pending_signature) to a hidden one (rescheduled / follow_up
    // / not_closed) makes it disappear from the admin queue. Confirm only
    // after validation passes so the admin doesn't accept the warning and
    // then have it re-prompt on the next attempt.
    const ADMIN_HIDDEN = new Set(["rescheduled", "follow_up", "not_closed"]);
    if (
      context === "admin" &&
      mode === "edit" &&
      initialData?.status &&
      !ADMIN_HIDDEN.has(initialData.status) &&
      ADMIN_HIDDEN.has(status)
    ) {
      const ok = window.confirm(
        `Changing status to "${status.replace(/_/g, " ")}" moves this deal back to the closer's queue and removes it from your view. Continue?`
      );
      if (!ok) return;
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
          if (clientEmail) fd.set("clientEmail", clientEmail);
          fd.set("dealValue", dealValue || "0");
          fd.set("closingDate", closingDate);
          fd.set("serviceCategory", serializedServices ?? "");
          fd.set("industry", industry);
          fd.set("status", status);
          fd.set("notes", notes);
          fd.set("paymentType", paymentType);
          if (brandName) fd.set("brandName", brandName);
          if (website) fd.set("website", website);
          if (googleEventId) fd.set("googleEventId", googleEventId);
          if (autoShowStatus) fd.set("showStatus", autoShowStatus);
          for (const addr of ccList) fd.append("additionalCcEmails", addr);

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
              clientEmail: clientEmail || null,
              paymentType,
              brandName: brandName || null,
              website: website || null,
              additionalCcEmails: ccList,
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
          body.clientEmail = clientEmail || null;
          body.paymentType = paymentType;
          body.brandName = brandName || null;
          body.website = website || null;
          body.additionalCcEmails = ccList;
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

      {/* Client Email */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Client Email <span className="text-muted-foreground font-normal">(optional)</span></label>
        <input
          type="email"
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
          placeholder="client@example.com"
          className={INPUT_CLS}
        />
      </div>

      {/* Additional CCs */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          Additional CCs <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-input bg-background px-2 py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
          {additionalCcEmails.map((addr) => (
            <span
              key={addr}
              className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground"
            >
              {addr}
              <button
                type="button"
                onClick={() => removeCc(addr)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${addr}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            inputMode="email"
            autoComplete="off"
            value={ccInputValue}
            onChange={(e) => {
              const v = e.target.value;
              // Auto-commit if the user types a separator character
              if (/[,;]$/.test(v)) {
                const raw = v.replace(/[,;]+$/, "").trim();
                if (raw) tryCommitCc(raw); else setCcInputValue("");
              } else {
                setCcInputValue(v);
                if (ccInputError) setCcInputError(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Tab") {
                if (ccInputValue.trim()) {
                  e.preventDefault();
                  tryCommitCc(ccInputValue);
                }
              } else if (e.key === "Backspace" && !ccInputValue && additionalCcEmails.length > 0) {
                e.preventDefault();
                removeCc(additionalCcEmails[additionalCcEmails.length - 1]);
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (!/[\s,;]/.test(text)) return; // single email — normal paste
              e.preventDefault();
              commitCcBatch(text.split(/[\s,;]+/));
            }}
            onBlur={() => { if (ccInputValue.trim()) tryCommitCc(ccInputValue); }}
            placeholder={additionalCcEmails.length === 0 ? "manager@example.com" : ""}
            className="flex-1 min-w-[160px] bg-transparent px-1 py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        {ccInputError && (
          <p className="mt-1 text-xs text-destructive">{ccInputError}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Press Enter or comma to add. These are CC&apos;d on the client invoice email (your own email is always CC&apos;d automatically).
        </p>
      </div>

      {/* Brand Name */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Brand Name <span className="text-muted-foreground font-normal">(optional)</span></label>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Brand or company name"
            className={`${INPUT_CLS} pl-10`}
          />
        </div>
      </div>

      {/* Website */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Website <span className="text-muted-foreground font-normal">(optional)</span></label>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            className={`${INPUT_CLS} pl-10`}
          />
        </div>
      </div>

      {/* Payment Type */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Payment Type</label>
        <select
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value)}
          className={INPUT_CLS}
        >
          {PAYMENT_TYPES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Status */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={INPUT_CLS}
        >
          {DEAL_STATUSES
            .filter((s) => context === "admin" || s.value !== "pending_signature")
            .map((s) => (
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
