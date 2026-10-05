"use client";

import { useEffect, useRef, useState } from "react";
import { DollarSign, Calendar, Tag, FileText, Send, Building2, Globe, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClientAutocomplete } from "@/components/closer/ClientAutocomplete";
import { ServiceMultiSelect } from "@/components/shared/ServiceMultiSelect";
import { INDUSTRIES, DEAL_STATUSES, PAYMENT_TYPES } from "@/components/closers/types";
import { parseServiceCategory, serializeServiceCategory } from "@/lib/serviceCategory";
import { createDealAction } from "@/app/actions/closerDeals";
import { SETTER_TIERS, SETTER_TIER_LABELS, type SetterTier } from "@/lib/appointments";
import type { CreatedDeal } from "@/lib/dealCreation";

const INPUT_CLS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-shadow";

/** POST /api/admin/deals result — the new deal and its draft invoice. */
export type AdminCreatedDeal = CreatedDeal;

/** Every deal list/metric an admin deal create or edit can change. */
const ADMIN_DEAL_QUERY_KEYS = [
  "closer-stats",
  "closer-deals",
  "closer-detail",
  "closers-stats",
  "admin-all-deals",
  "admin-all-deals-calendar",
  "admin-deals",
  "admin-deal-queue-metrics",
];

interface CreditOption {
  id: string;
  displayName: string;
}

/** GET /api/admin/deals/create-options — who an admin-entered deal can credit. */
interface AdminCreateOptions {
  house: CreditOption;
  closers: CreditOption[];
  setters: CreditOption[];
}

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
    setterId?: string | null;
    setterTier?: SetterTier | null;
    noRetainer?: boolean;
  };
  calendarEvent?: {
    id: string;
    title: string;
    date: string; // YYYY-MM-DD
  };
  readOnlyDate?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
  /** Fires when the form starts/stops differing from what it mounted with —
   *  lets a hosting modal confirm before discarding edits. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Fires while a submit is in flight — lets a hosting modal block closing. */
  onPendingChange?: (pending: boolean) => void;
  /** Admin create only: the created deal (+ its invoice id) for follow-up. */
  onCreated?: (result: AdminCreatedDeal) => void;
}

export function UnifiedDealForm({
  mode,
  context,
  initialData,
  calendarEvent,
  readOnlyDate,
  onSuccess,
  onCancel,
  onDirtyChange,
  onPendingChange,
  onCreated,
}: UnifiedDealFormProps) {
  // Plain state, not useTransition: on React 18 an async transition's
  // isPending clears at the first await, so the button re-enabled mid-request
  // (double submits) and the "Saving..." state never really showed.
  const [isPending, setIsPending] = useState(false);
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
  const ccFieldRef = useRef<HTMLDivElement>(null);
  // Admin-only tier override + no-retainer flag (1099 §3.3, §3.8). Initialized
  // from the deal so the form reflects what the setter picked, but admin has
  // the final say. `setterTier === ""` means "no tier — drops setter from
  // commission for this deal" (setter attribution itself is preserved so
  // history is auditable).
  const [setterTier, setSetterTier] = useState<"" | SetterTier>(initialData?.setterTier ?? "");
  const [noRetainer, setNoRetainer] = useState<boolean>(initialData?.noRetainer ?? false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const showAdminTierFields = context === "admin" && mode === "edit";
  const hasSetter = Boolean(initialData?.setterId);

  // Admin create (Deal queue "New deal"): the admin picks who gets credit —
  // the built-in House closer by default — and an optional setter + tier.
  const adminCreate = context === "admin" && mode === "create";
  const createOptionsQuery = useQuery<AdminCreateOptions>({
    queryKey: ["admin-deal-create-options"],
    queryFn: async () => {
      const res = await fetch("/api/admin/deals/create-options");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json.data;
    },
    enabled: adminCreate,
    staleTime: 5 * 60_000,
  });
  const createOptions = createOptionsQuery.data;
  // "" = the House default (its id arrives with the options).
  const [creditCloserId, setCreditCloserId] = useState("");
  const [creditSetterId, setCreditSetterId] = useState("");
  const effectiveCloserId = creditCloserId || createOptions?.house.id || "";

  // Dirty = any field differs from the values the form mounted with.
  const fieldsKey = JSON.stringify([
    clientName, clientUserId, clientEmail, dealValue, closingDate, selectedServices, industry,
    status, notes, paymentType, brandName, website, additionalCcEmails, ccInputValue, setterTier, noRetainer,
    creditCloserId, creditSetterId,
  ]);
  const [initialFieldsKey] = useState(fieldsKey);
  const dirty = fieldsKey !== initialFieldsKey;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onPendingChange?.(isPending); }, [isPending, onPendingChange]);

  // The success banner auto-dismisses so it doesn't linger into the next entry.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(false), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const clientEmailLc = clientEmail.trim().toLowerCase();

  function tryCommitCc(raw: string): boolean {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254) {
      setCcInputError("Enter a valid email address");
      return false;
    }
    if (trimmed === clientEmailLc) {
      setCcInputError("That's the client email");
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
      if (v === clientEmailLc) {
        if (firstError === null) firstError = "That's the client email";
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

  function handleDiscard() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    setSuccess(false);

    // A blocked CC is flagged next to the field AND by the submit button, with
    // the field scrolled into view — on a phone the field is far above Submit.
    function blockOnCc(message: string) {
      setCcInputError(message);
      setError(`Additional CCs: ${message}`);
      ccFieldRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    // Commit any pending CC input (so typed-but-unconfirmed values aren't dropped)
    let ccList = additionalCcEmails;
    if (ccInputValue.trim()) {
      const pending = ccInputValue.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pending) || pending.length > 254) {
        blockOnCc("Enter a valid email address");
        return;
      }
      if (pending === clientEmailLc) {
        blockOnCc("That's the client email");
        return;
      }
      if (!ccList.includes(pending) && ccList.length < 10) {
        ccList = [...ccList, pending];
        setAdditionalCcEmails(ccList);
        setCcInputValue("");
        setCcInputError(null);
      }
    }

    // The client is already the invoice's To: address — a CC of it is a
    // duplicate (e.g. left over from before the email was edited, or legacy
    // data on an older deal). Drop it rather than block an unrelated save;
    // the send route de-dupes it anyway.
    if (clientEmailLc && ccList.includes(clientEmailLc)) {
      ccList = ccList.filter((e) => e !== clientEmailLc);
      setAdditionalCcEmails(ccList);
    }
    const trimmedEmail = clientEmail.trim();

    // Validation
    if (!clientName.trim()) {
      setError("Client name is required");
      return;
    }
    if (adminCreate) {
      if (!effectiveCloserId) {
        setError(createOptionsQuery.isError ? "Couldn't load closers — close and try again" : "Still loading closers…");
        return;
      }
      if (creditSetterId && !setterTier) {
        setError("Pick the setter's tier (or remove the setter)");
        return;
      }
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

    setIsPending(true);
    try {
      if (context === "closer" && mode === "create") {
        // Server action
        const fd = new FormData();
        fd.set("clientName", clientName);
        if (clientUserId) fd.set("clientUserId", clientUserId);
        if (trimmedEmail) fd.set("clientEmail", trimmedEmail);
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
        // Reset first — resetForm clears `success`, so the other order
        // batched the banner away before it ever rendered.
        resetForm();
        setSuccess(true);
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
            clientEmail: trimmedEmail || null,
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
      } else if (adminCreate) {
        // Created closed: lands in the Deal queue with its draft invoice.
        const res = await fetch("/api/admin/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              closerId: effectiveCloserId,
              clientName: clientName.trim(),
              clientEmail: trimmedEmail || null,
              dealValue: Math.round((parseFloat(dealValue) || 0) * 100), // cents
              closingDate: closingDate || null,
              serviceCategory: selectedServices,
              industry: industry || null,
              notes: notes || null,
              paymentType,
              brandName: brandName || null,
              website: website || null,
              additionalCcEmails: ccList,
              setterId: creditSetterId || null,
              setterTier: creditSetterId ? setterTier || null : null,
              noRetainer: creditSetterId ? noRetainer : false,
            },
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error || "Failed to create the deal");
          return;
        }
        for (const key of ADMIN_DEAL_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
        onCreated?.(json.data as AdminCreatedDeal);
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
        body.clientEmail = trimmedEmail || null;
        body.paymentType = paymentType;
        body.brandName = brandName || null;
        body.website = website || null;
        body.additionalCcEmails = ccList;
        if (autoShowStatus) body.showStatus = autoShowStatus;
        if (showAdminTierFields) {
          // Empty string → null (clears tier on the deal so it pays $0
          // without disturbing the setter attribution). Admin sees the
          // setter row but commission math drops them.
          body.setterTier = setterTier === "" ? null : setterTier;
          body.noRetainer = noRetainer;
        }

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
        for (const key of ADMIN_DEAL_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
        onSuccess?.();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  const showClientAutocomplete = (context === "closer" || context === "calendar-link") && mode === "create";
  const submitLabel =
    mode === "create"
      ? context === "calendar-link" || adminCreate
        ? "Create Deal"
        : "Submit Entry"
      : "Save Changes";
  const cancelLabel = mode === "create" && context === "closer" ? "Discard" : "Cancel";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Credit — admin create only. House is the default: the deal belongs to
          the agency, with no closer commission. */}
      {adminCreate && (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
          <div>
            <label htmlFor="admin-deal-closer" className="text-sm font-medium text-foreground mb-1.5 block">
              Credited closer
            </label>
            <select
              id="admin-deal-closer"
              value={effectiveCloserId}
              onChange={(e) => setCreditCloserId(e.target.value)}
              disabled={!createOptions}
              className={INPUT_CLS}
            >
              {!createOptions ? (
                <option value="">{createOptionsQuery.isError ? "Couldn't load closers" : "Loading…"}</option>
              ) : (
                <>
                  <option value={createOptions.house.id}>
                    {createOptions.house.displayName} — agency deal, no closer commission
                  </option>
                  {createOptions.closers.map((c) => (
                    <option key={c.id} value={c.id}>{c.displayName}</option>
                  ))}
                </>
              )}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {effectiveCloserId && effectiveCloserId !== createOptions?.house.id
                ? "Counts toward this closer's revenue and commission, and shows in their portal."
                : "Counts toward company revenue only — no closer gets credit."}
            </p>
          </div>
          <div>
            <label htmlFor="admin-deal-setter" className="text-sm font-medium text-foreground mb-1.5 block">
              Setter <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <select
              id="admin-deal-setter"
              value={creditSetterId}
              onChange={(e) => setCreditSetterId(e.target.value)}
              disabled={!createOptions}
              className={INPUT_CLS}
            >
              <option value="">No setter</option>
              {createOptions?.setters.map((s) => (
                <option key={s.id} value={s.id}>{s.displayName}</option>
              ))}
            </select>
          </div>
          {creditSetterId && (
            <>
              <div>
                <label htmlFor="admin-deal-tier" className="text-sm font-medium text-foreground mb-1.5 block">
                  Setter tier
                </label>
                <select
                  id="admin-deal-tier"
                  value={setterTier}
                  onChange={(e) => setSetterTier(e.target.value as "" | SetterTier)}
                  className={INPUT_CLS}
                >
                  <option value="">Select tier…</option>
                  {SETTER_TIERS.map((t) => (
                    <option key={t} value={t}>
                      Tier {t} — {SETTER_TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={noRetainer}
                  onChange={(e) => setNoRetainer(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span>
                  No-retainer deal —{" "}
                  <span className="text-muted-foreground">cap setter commission at $500 (§3.8)</span>
                </span>
              </label>
            </>
          )}
        </div>
      )}

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
      <div ref={ccFieldRef}>
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

      {/* Status — an admin-entered deal is always created closed: only closed
          deals get the invoice (+ contract) to review and send. */}
      {adminCreate ? (
        <p className="text-xs text-muted-foreground">
          Created as <span className="font-medium text-foreground">Closed</span> — its invoice lands in the Deal
          queue for review. Nothing is emailed until you send it.
        </p>
      ) : (
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
      )}

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

      {/* Admin-only setter payout override. Surfaces the tier the setter
          picked and lets admin override per the 1099 contract §3.3, plus
          a no-retainer flag that caps tier A/B at $500 per §3.8. */}
      {showAdminTierFields && (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Setter payout</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasSetter
                ? "Override the tier the setter picked. Set to none to drop them from this deal's commission."
                : "No setter attributed to this deal."}
            </p>
          </div>
          {hasSetter && (
            <>
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">Tier</label>
                <select
                  value={setterTier}
                  onChange={(e) => setSetterTier(e.target.value as "" | SetterTier)}
                  className={INPUT_CLS}
                >
                  <option value="">None — no setter commission</option>
                  {SETTER_TIERS.map((t) => (
                    <option key={t} value={t}>
                      Tier {t} — {SETTER_TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={noRetainer}
                  onChange={(e) => setNoRetainer(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span>
                  No-retainer deal —{" "}
                  <span className="text-muted-foreground">cap setter commission at $500 (§3.8)</span>
                </span>
              </label>
            </>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Notes</label>
        <div className="relative">
          <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes..."
            rows={4}
            className="flex w-full min-h-[96px] rounded-lg border border-input bg-background pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-shadow resize-y"
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
            disabled={isPending}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {cancelLabel}
          </button>
        )}
        {!onCancel && mode === "create" && (
          <button
            type="button"
            onClick={handleDiscard}
            disabled={isPending}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:pointer-events-none"
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
