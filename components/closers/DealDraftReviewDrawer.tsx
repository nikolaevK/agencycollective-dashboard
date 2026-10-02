"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Save, ThumbsDown, ThumbsUp, Bot } from "lucide-react";
import { InvoiceDrawerShell } from "@/components/invoice/InvoiceDrawerShell";
import { InvoiceTotalsSummary } from "@/components/invoice/InvoiceTotalsSummary";
import { InvoiceNotesFields } from "@/components/invoice/InvoiceNotesFields";
import { LineItemsEditor } from "@/components/invoice/LineItemsEditor";
import { CcChipsInput, useCcField } from "@/components/invoice/CcChipsInput";
import { DiscountField } from "@/components/invoice/InvoiceChargesForm";
import { ServiceMultiSelect } from "@/components/shared/ServiceMultiSelect";
import { DEAL_STATUSES } from "@/components/closers/types";
import { calculateTotals } from "@/lib/invoice/validation";
import { invoiceToSpec } from "@/lib/invoice/invoiceSpec";
import { DEFAULT_MAX_CC, isValidEmail } from "@/lib/invoice/email";
import { parseServiceCategory } from "@/lib/serviceCategory";
import type { DealDraft } from "@/lib/dealDrafts";
import type { DealRecord } from "@/lib/deals";
import type { DiscountDetails, InvoiceData, InvoiceItem } from "@/types/invoice";
import { cn } from "@/lib/utils";

const FIELD =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";
const LABEL = "mb-1 block text-xs font-medium text-muted-foreground";

type DraftDetail = DealDraft & {
  closerName: string | null;
  invoicePreview: InvoiceData | null;
  refs: { setterName: string | null; clientUserName: string | null };
};

interface ApprovalExtra {
  label: string;
  value: string;
  /** Differs from what a portal-created deal would get — worth a second look. */
  warn?: boolean;
}

/** Agent-set fields the form doesn't show but approval still applies. */
function approvalExtras(d: DraftDetail, status: string): ApprovalExtra[] {
  const f = d.fields;
  const out: ApprovalExtra[] = [];
  if (f.setterId) {
    out.push({ label: "Setter", value: `${d.refs?.setterName ?? f.setterId}${f.setterTier ? ` · Tier ${f.setterTier}` : ""}` });
  } else if (f.googleEventId) {
    out.push({ label: "Setter", value: "From the calendar claim, if any" });
  }
  if (f.googleEventId) {
    out.push({
      label: "Calendar",
      value:
        status === "closed"
          ? "Linked to a calendar event — approving marks the lead as showed and syncs GHL"
          : "Linked to a calendar event",
    });
  }
  if (f.paidStatus === "paid") {
    out.push({ label: "Paid status", value: "Paid — portal-created deals always start unpaid", warn: true });
  }
  if (f.noRetainer) out.push({ label: "No retainer", value: "Yes — caps setter commission at $500", warn: true });
  if (f.clientUserId) out.push({ label: "Client", value: d.refs?.clientUserName ?? f.clientUserId });
  if (f.industry) out.push({ label: "Industry", value: f.industry });
  return out;
}

export interface ApprovedDeal {
  deal: DealRecord;
  invoiceId: string | null;
  warnings: string[];
}

interface Props {
  draftId: string;
  onClose: () => void;
  /** Approved — the caller can open the new deal's invoice for sending. */
  onApproved: (result: ApprovedDeal) => void;
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Editable form state for the proposed deal (dollars for the value input). */
interface FormState {
  closerId: string;
  clientName: string;
  clientEmail: string;
  dealValue: string;
  status: string;
  closingDate: string;
  services: string[];
  paymentType: string;
  brandName: string;
  website: string;
  notes: string;
}

function toForm(d: DealDraft): FormState {
  const f = d.fields;
  return {
    closerId: f.closerId,
    clientName: f.clientName,
    clientEmail: f.clientEmail ?? "",
    dealValue: f.dealValue ? String(f.dealValue / 100) : "",
    status: f.status,
    closingDate: f.closingDate ?? "",
    services: parseServiceCategory(f.serviceCategory),
    paymentType: f.paymentType,
    brandName: f.brandName ?? "",
    website: f.website ?? "",
    notes: f.notes ?? "",
  };
}

/**
 * Review a deal an agent proposed: edit anything, then Approve (creates the
 * deal + its draft invoice/contract through the normal path — nothing is
 * emailed) or Reject with a note the agent can read back.
 */
export function DealDraftReviewDrawer({ draftId, onClose, onApproved }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  // Only the reviewer's own invoice edits are sent (as a full spec); untouched,
  // the draft keeps whatever spec it has (an agent's, or none — then the lines
  // regenerate from the final deal value / services on approval).
  const [invoiceTouched, setInvoiceTouched] = useState(false);
  // "Reset to generated lines": the next Save/Approve clears the draft's spec.
  const [resetInvoice, setResetInvoice] = useState(false);
  const [dirty, setDirty] = useState(false);
  const cc = useCcField(DEFAULT_MAX_CC, () => setDirty(true));
  // updatedAt of the version the form was seeded from — Save/Approve send it so
  // the server can refuse (409 stale) when the draft changed since.
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const { data: draft, isLoading, isError, isFetching, refetch } = useQuery<DraftDetail>({
    queryKey: ["deal-draft", draftId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deals/drafts/${draftId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json.data;
    },
    staleTime: 0,
  });

  const { data: closers = [] } = useQuery<{ id: string; displayName: string; role: string; status: string }[]>({
    queryKey: ["admin-closers-options"],
    queryFn: async () => {
      const res = await fetch("/api/admin/closers");
      if (!res.ok) return [];
      return (await res.json()).data ?? [];
    },
    staleTime: 60_000,
  });

  // Seed (and re-seed after a save) unless the reviewer has unsaved edits.
  const { setEmails: setCcEmails, setDraft: setCcDraft, setError: setCcError } = cc;
  function seed(d: DraftDetail) {
    setForm(toForm(d));
    setCcEmails(d.fields.additionalCcEmails);
    setCcDraft("");
    setCcError(null);
    setInvoice(d.invoicePreview);
    setInvoiceTouched(false);
    setResetInvoice(false);
    setBaseUpdatedAt(d.updatedAt);
  }
  useEffect(() => {
    if (!draft || dirty) return;
    seed(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const pending = draft?.status === "pending";
  const valueCents = form ? Math.round((parseFloat(form.dealValue) || 0) * 100) : 0;

  function patchForm(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f));
    setDirty(true);
  }
  function editInvoice(next: InvoiceData) {
    const { subTotal, totalAmount } = calculateTotals(
      next.details.items,
      next.details.discountDetails,
      next.details.taxDetails,
      next.details.shippingDetails
    );
    setInvoice({ ...next, details: { ...next.details, subTotal, totalAmount } });
    setInvoiceTouched(true);
    setResetInvoice(false);
    setDirty(true);
  }
  function resetToGenerated() {
    setResetInvoice(true);
    setInvoiceTouched(false);
    setDirty(true);
  }
  /** Stale draft: drop local edits and re-seed from the latest version. */
  async function loadLatest() {
    const res = await refetch();
    if (res.isError || !res.data) return setError("Couldn't load the latest version. Try again.");
    setStale(false);
    setError(null);
    setDirty(false);
    seed(res.data);
  }

  const payload = useMemo(() => {
    if (!form) return null;
    return {
      fields: {
        closerId: form.closerId,
        clientName: form.clientName,
        clientEmail: form.clientEmail.trim() || null,
        dealValue: valueCents,
        status: form.status,
        closingDate: form.closingDate || null,
        serviceCategory: form.services,
        paymentType: form.paymentType,
        brandName: form.brandName || null,
        website: form.website || null,
        notes: form.notes || null,
        additionalCcEmails: cc.emails,
      },
      ...(resetInvoice
        ? { invoice: null }
        : invoiceTouched && invoice
        ? {
            invoice: {
              ...invoiceToSpec(invoice),
              // A renamed client follows onto the invoice unless the Bill-to
              // was deliberately set to something else.
              billToName:
                invoice.receiver.name === draft?.fields.clientName ? form.clientName : invoice.receiver.name,
            },
          }
        : {}),
    };
  }, [form, valueCents, cc.emails, resetInvoice, invoiceTouched, invoice, draft]);

  /** Request body with the committed CC list + the version the edits are based on. */
  function requestBody(finalCcs: string[]) {
    return JSON.stringify(
      payload ? { ...payload, fields: { ...payload.fields, additionalCcEmails: finalCcs }, baseUpdatedAt } : {}
    );
  }

  function validate(): string | null {
    if (!form) return "Still loading";
    if (!form.clientName.trim()) return "Client name is required";
    if (form.status !== "not_closed" && valueCents <= 0) return "Deal value must be greater than 0";
    if (form.clientEmail.trim() && !isValidEmail(form.clientEmail)) return "Client email is not valid";
    if (invoiceTouched && invoice && invoice.details.items.some((it) => !it.name.trim())) {
      return "Every invoice line needs a name";
    }
    return null;
  }

  async function save() {
    const v = validate();
    if (v) return setError(v);
    const finalCcs = cc.finalize([form?.clientEmail]);
    if (!finalCcs) return setError("Fix the CC field first");
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/admin/deals/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: requestBody(finalCcs),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.code === "stale") return setStale(true);
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setDirty(false);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["deal-drafts"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    const v = validate();
    if (v) return setError(v);
    const finalCcs = cc.finalize([form?.clientEmail]);
    if (!finalCcs) return setError("Fix the CC field first");
    setBusy("approve");
    setError(null);
    try {
      const res = await fetch(`/api/admin/deals/drafts/${draftId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody(finalCcs),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.code === "stale") return setStale(true);
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["deal-drafts"] });
      // Same refreshes as any other deal create/edit (stats, lists, calendar —
      // a closed calendar-linked approval also writes attendance).
      for (const key of [
        "admin-deals",
        "admin-deal-queue-metrics",
        "admin-all-deals",
        "admin-all-deals-calendar",
        "admin-attendance",
        "closers-stats",
        "closer-detail",
        "closer-deals",
        "closer-stats",
        "team-attendance",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      onApproved(json.data as ApprovedDeal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve");
      refetch();
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy("reject");
    setError(null);
    try {
      const res = await fetch(`/api/admin/deals/drafts/${draftId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: rejectNote.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["deal-drafts"] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject");
      // e.g. approved/rejected meanwhile — show the draft's real status.
      refetch();
    } finally {
      setBusy(null);
    }
  }

  const extras = draft && form ? approvalExtras(draft, form.status) : [];

  const footer =
    draft && form ? (
      <div className="space-y-2">
        {stale && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <p className="min-w-0 flex-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              This draft changed since you opened it. Load the latest version to continue — your unsaved edits here
              will be discarded.
            </p>
            <button
              type="button"
              onClick={loadLatest}
              disabled={isFetching}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-500/10 disabled:opacity-60 dark:text-amber-400 sm:h-7"
            >
              {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Load latest
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
            {error}
          </div>
        )}
        {pending && rejecting ? (
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <label htmlFor="reject-note" className="text-xs font-medium text-foreground">
              Reason (shared with whoever prepared it)
            </label>
            <textarea
              id="reject-note"
              rows={2}
              maxLength={2000}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Duplicate of an existing deal / wrong amount"
              className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejecting(false)}
                disabled={busy !== null}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={busy !== null}
                className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
              >
                {busy === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                Reject draft
              </button>
            </div>
          </div>
        ) : pending ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              Reject
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy !== null || !dirty || stale}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
              title="Save your edits to the draft without approving"
            >
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
            {dirty && <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>}
            <button
              type="button"
              onClick={approve}
              disabled={busy !== null || stale}
              className="ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/20 ac-gradient disabled:opacity-60"
            >
              {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
              Approve &amp; create deal
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            This draft was {draft.status}
            {draft.reviewedByName ? ` by ${draft.reviewedByName}` : ""}
            {draft.reviewedAt ? ` on ${new Date(draft.reviewedAt).toLocaleString()}` : ""}.
            {draft.reviewNote ? ` Note: ${draft.reviewNote}` : ""}
          </p>
        )}
      </div>
    ) : null;

  return (
    <InvoiceDrawerShell
      title="Review deal draft"
      badges={
        draft && (
          <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium capitalize text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
            {draft.status}
          </span>
        )
      }
      subtitle={draft ? `${draft.fields.clientName}${draft.closerName ? ` · ${draft.closerName}` : ""}` : undefined}
      onClose={onClose}
      dirty={dirty}
      busy={busy === "approve"}
      preview={invoice}
      footer={footer}
    >
      {!form && (isLoading || (draft && !isError)) ? (
        // Loaded but not seeded yet counts as loading (no error flash).
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !draft || !form ? (
        <p className="py-12 text-center text-sm text-destructive">Couldn&apos;t load this draft.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
              <Bot className="h-3.5 w-3.5" />
              Proposed by {draft.createdByName ?? "an agent"}
              <span className="font-normal text-muted-foreground">· {new Date(draft.createdAt).toLocaleString()}</span>
            </p>
            {draft.note && <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{draft.note}</p>}
            {pending && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Nothing exists yet. Approving creates the deal (and, for a closed deal, its invoice + contract to review and send). It emails nobody.
              </p>
            )}
          </div>

          <Section title="Deal">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="dd-client" className={LABEL}>Client name</label>
                <input id="dd-client" className={FIELD} disabled={!pending} value={form.clientName} onChange={(e) => patchForm({ clientName: e.target.value })} />
              </div>
              <div>
                <label htmlFor="dd-closer" className={LABEL}>Closer</label>
                <select id="dd-closer" className={FIELD} disabled={!pending} value={form.closerId} onChange={(e) => patchForm({ closerId: e.target.value })}>
                  {!closers.some((c) => c.id === form.closerId) && (
                    <option value={form.closerId}>{draft.closerName ?? form.closerId}</option>
                  )}
                  {closers
                    .filter((c) => c.role !== "setter")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                        {c.status !== "active" ? " (inactive)" : ""}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="dd-value" className={LABEL}>Deal value ($)</label>
                <input
                  id="dd-value"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className={FIELD}
                  disabled={!pending}
                  value={form.dealValue}
                  onChange={(e) => patchForm({ dealValue: e.target.value.startsWith("-") ? "" : e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="dd-status" className={LABEL}>Status on approval</label>
                <select id="dd-status" className={FIELD} disabled={!pending} value={form.status} onChange={(e) => patchForm({ status: e.target.value })}>
                  {DEAL_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dd-date" className={LABEL}>Closing date</label>
                <input id="dd-date" type="date" className={FIELD} disabled={!pending} value={form.closingDate} onChange={(e) => patchForm({ closingDate: e.target.value })} />
              </div>
              <div>
                <span className={LABEL}>Payment type</span>
                <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                  {["local", "international"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={!pending}
                      aria-pressed={form.paymentType === t}
                      onClick={() => patchForm({ paymentType: t })}
                      className={cn(
                        "flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors",
                        form.paymentType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <span className={LABEL}>Services</span>
              {pending ? (
                <ServiceMultiSelect value={form.services} onChange={(services) => patchForm({ services })} />
              ) : (
                <p className="text-sm text-foreground">{form.services.join(", ") || "—"}</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="dd-brand" className={LABEL}>Brand</label>
                <input id="dd-brand" className={FIELD} disabled={!pending} value={form.brandName} onChange={(e) => patchForm({ brandName: e.target.value })} />
              </div>
              <div>
                <label htmlFor="dd-website" className={LABEL}>Website</label>
                <input id="dd-website" className={FIELD} disabled={!pending} value={form.website} onChange={(e) => patchForm({ website: e.target.value })} />
              </div>
            </div>
            <div>
              <label htmlFor="dd-notes" className={LABEL}>Closer notes</label>
              <textarea
                id="dd-notes"
                rows={3}
                disabled={!pending}
                value={form.notes}
                onChange={(e) => patchForm({ notes: e.target.value })}
                className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </Section>

          {extras.length > 0 && (
            <Section title="Also applied on approval">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                {extras.map((x) => (
                  <Fragment key={x.label}>
                    <dt className="text-muted-foreground">{x.label}</dt>
                    <dd
                      className={cn(
                        "break-words",
                        x.warn ? "flex items-start gap-1 font-medium text-amber-600 dark:text-amber-400" : "text-foreground"
                      )}
                    >
                      {x.warn && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                      {x.value}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </Section>
          )}

          <Section title="Recipient">
            <div>
              <label htmlFor="dd-email" className={LABEL}>Client email</label>
              <input
                id="dd-email"
                type="email"
                disabled={!pending}
                className={cn(FIELD, form.clientEmail.trim() && !isValidEmail(form.clientEmail) && "border-destructive/60")}
                value={form.clientEmail}
                onChange={(e) => patchForm({ clientEmail: e.target.value })}
                placeholder="client@example.com"
              />
              {!form.clientEmail.trim() && form.status === "closed" && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> Without an email no contract is prepared, and the invoice can&apos;t be sent until one is added.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="dd-cc" className={LABEL}>Additional CCs</label>
              <CcChipsInput field={cc} id="dd-cc" exclude={[form.clientEmail]} disabled={!pending} />
            </div>
          </Section>

          <Section
            title="Invoice"
            aside={
              invoice && pending ? (
                <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  <span className="text-[11px] text-muted-foreground">
                    {resetInvoice
                      ? "Regenerates on save"
                      : invoiceTouched
                      ? "Your lines are used as-is"
                      : draft.invoice
                      ? "Proposed lines"
                      : "Generated from value + services"}
                  </span>
                  {!resetInvoice && (invoiceTouched || draft.invoice) && (
                    <button
                      type="button"
                      onClick={resetToGenerated}
                      disabled={busy !== null}
                      className="h-9 rounded-md px-2 text-[11px] font-medium text-primary hover:bg-primary/5 disabled:opacity-60 sm:h-7"
                      title="Drop the proposed/edited lines — the invoice is generated from the deal value + services"
                    >
                      Reset to generated lines
                    </button>
                  )}
                </div>
              ) : undefined
            }
          >
            {!invoice ? (
              <p className="text-xs text-muted-foreground">
                {form.status === "closed"
                  ? "Save the draft to generate the invoice preview."
                  : "Only closed deals get an invoice — none is created for this status."}
              </p>
            ) : (
              <>
                <LineItemsEditor
                  items={invoice.details.items}
                  currency={invoice.details.currency}
                  disabled={!pending}
                  minItems={1}
                  onChange={(items: InvoiceItem[]) => editInvoice({ ...invoice, details: { ...invoice.details, items } })}
                />
                {pending && (
                  <DiscountField
                    discount={invoice.details.discountDetails}
                    onChange={(discountDetails: DiscountDetails | null) =>
                      editInvoice({ ...invoice, details: { ...invoice.details, discountDetails } })
                    }
                  />
                )}
                {pending && (
                  <InvoiceNotesFields
                    idPrefix="dd-inv"
                    paymentTerms={invoice.details.paymentTerms}
                    additionalNotes={invoice.details.additionalNotes}
                    onChange={(patch) => editInvoice({ ...invoice, details: { ...invoice.details, ...patch } })}
                  />
                )}
                <InvoiceTotalsSummary details={invoice.details} />
                {pending && Math.round(invoice.details.totalAmount * 100) !== valueCents && valueCents > 0 && (
                  <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> Invoice total differs from the deal value.
                  </p>
                )}
                {pending && resetInvoice ? (
                  <p className="text-[11px] text-muted-foreground">
                    Save (or approve) to replace these lines with ones generated from the deal value + services.
                  </p>
                ) : (
                  pending &&
                  dirty &&
                  !invoiceTouched && (
                    <p className="text-[11px] text-muted-foreground">
                      Changed the value or services? Save to refresh the generated lines.
                    </p>
                  )
                )}
              </>
            )}
          </Section>

          {draft.status === "approved" && draft.dealId && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Approved — the deal is in the queue.
            </p>
          )}
        </div>
      )}
    </InvoiceDrawerShell>
  );
}
