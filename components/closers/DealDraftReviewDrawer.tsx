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
import { DEAL_STATUSES, DRAFT_STATUS_TONE } from "@/components/closers/types";
import { calculateTotals } from "@/lib/invoice/validation";
import { invoiceToSpec } from "@/lib/invoice/invoiceSpec";
import { DEFAULT_MAX_CC, isValidEmail } from "@/lib/invoice/email";
import { parseServiceCategory } from "@/lib/serviceCategory";
import type { DealDraft } from "@/lib/dealDrafts";
import type { DealRecord } from "@/lib/deals";
import type { DiscountDetails, InvoiceData, InvoiceItem } from "@/types/invoice";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Radix SelectItem can't hold "" — stands in for an empty closer id. */
const NONE = "__none__";
/** Field label for the non-<label> captions (Payment type, Services). */
const CAPTION = "text-sm font-medium leading-none";

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
    <section className="space-y-4 rounded-2xl bg-muted/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
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
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/50 px-4 py-3">
            <p className="flex min-w-0 flex-1 items-start gap-2 text-xs font-medium">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <span>
                This draft changed since you opened it. Load the latest version to continue — your unsaved edits here
                will be discarded.
              </span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadLatest}
              disabled={isFetching}
              className="h-9 shrink-0 sm:h-8"
            >
              {isFetching && <Loader2 className="size-3.5 animate-spin" />}
              Load latest
            </Button>
          </div>
        )}
        {error && (
          <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive">
            {error}
          </div>
        )}
        {pending && rejecting ? (
          <div className="grid gap-2 rounded-2xl bg-muted/50 p-4">
            <Label htmlFor="reject-note">
              Reason (shared with whoever prepared it)
            </Label>
            <Textarea
              id="reject-note"
              rows={2}
              maxLength={2000}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Duplicate of an existing deal / wrong amount"
              className="min-h-0 resize-y"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRejecting(false)}
                disabled={busy !== null}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={reject}
                disabled={busy !== null}
              >
                {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <ThumbsDown className="size-3.5" />}
                Reject draft
              </Button>
            </div>
          </div>
        ) : pending ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setRejecting(true)}
              disabled={busy !== null}
            >
              <ThumbsDown className="size-3.5" />
              Reject
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={save}
              disabled={busy !== null || !dirty || stale}
              title="Save your edits to the draft without approving"
            >
              {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save
            </Button>
            {dirty && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            )}
            <Button
              type="button"
              onClick={approve}
              disabled={busy !== null || stale}
              className="ml-auto"
            >
              {busy === "approve" ? <Loader2 className="animate-spin" /> : <ThumbsUp />}
              Approve &amp; create deal
            </Button>
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
          <StatusBadge tone={DRAFT_STATUS_TONE[draft.status]} className="capitalize">
            {draft.status}
          </StatusBadge>
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
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !draft || !form ? (
        <p className="py-12 text-center text-sm text-destructive">Couldn&apos;t load this draft.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-muted/50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Bot className="size-3.5 text-muted-foreground" />
              Proposed by {draft.createdByName ?? "an agent"}
              <span className="font-normal text-muted-foreground">· {new Date(draft.createdAt).toLocaleString()}</span>
            </p>
            {draft.note && <p className="mt-1 whitespace-pre-wrap text-xs">{draft.note}</p>}
            {pending && (
              <p className="mt-1 text-xs text-muted-foreground">
                Nothing exists yet. Approving creates the deal (and, for a closed deal, its invoice + contract to review and send). It emails nobody.
              </p>
            )}
          </div>

          <Section title="Deal">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="dd-client">Client name</Label>
                <Input id="dd-client" disabled={!pending} value={form.clientName} onChange={(e) => patchForm({ clientName: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dd-closer">Closer</Label>
                <Select
                  disabled={!pending}
                  value={form.closerId || NONE}
                  onValueChange={(v) => patchForm({ closerId: v === NONE ? "" : v })}
                >
                  <SelectTrigger id="dd-closer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!closers.some((c) => c.id === form.closerId) && (
                      <SelectItem value={form.closerId || NONE}>{draft.closerName ?? form.closerId}</SelectItem>
                    )}
                    {closers
                      .filter((c) => c.role !== "setter")
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.displayName}
                          {c.status !== "active" ? " (inactive)" : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dd-value">Deal value ($)</Label>
                <Input
                  id="dd-value"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  disabled={!pending}
                  value={form.dealValue}
                  onChange={(e) => patchForm({ dealValue: e.target.value.startsWith("-") ? "" : e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dd-status">Status on approval</Label>
                <Select disabled={!pending} value={form.status} onValueChange={(v) => patchForm({ status: v })}>
                  <SelectTrigger id="dd-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dd-date">Closing date</Label>
                <DatePicker id="dd-date" disabled={!pending} value={form.closingDate} onValueChange={(v) => patchForm({ closingDate: v })} />
              </div>
              <div className="grid gap-2">
                <span className={CAPTION}>Payment type</span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  disabled={!pending}
                  value={form.paymentType}
                  onValueChange={(v) => { if (v) patchForm({ paymentType: v }); }}
                  aria-label="Payment type"
                  className="w-full"
                >
                  {["local", "international"].map((t) => (
                    <ToggleGroupItem key={t} value={t} className="flex-1 capitalize">
                      {t}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>
            <div className="grid gap-2">
              <span className={CAPTION}>Services</span>
              {pending ? (
                <ServiceMultiSelect value={form.services} onChange={(services) => patchForm({ services })} />
              ) : (
                <p className="text-sm">{form.services.join(", ") || "—"}</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="dd-brand">Brand</Label>
                <Input id="dd-brand" disabled={!pending} value={form.brandName} onChange={(e) => patchForm({ brandName: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dd-website">Website</Label>
                <Input id="dd-website" disabled={!pending} value={form.website} onChange={(e) => patchForm({ website: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dd-notes">Closer notes</Label>
              <Textarea
                id="dd-notes"
                rows={3}
                disabled={!pending}
                value={form.notes}
                onChange={(e) => patchForm({ notes: e.target.value })}
                className="resize-y"
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
                        x.warn && "flex items-start gap-1 font-medium"
                      )}
                    >
                      {x.warn && <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />}
                      {x.value}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </Section>
          )}

          <Section title="Recipient">
            <div className="grid gap-2">
              <Label htmlFor="dd-email">Client email</Label>
              <Input
                id="dd-email"
                type="email"
                disabled={!pending}
                aria-invalid={form.clientEmail.trim() && !isValidEmail(form.clientEmail) ? true : undefined}
                value={form.clientEmail}
                onChange={(e) => patchForm({ clientEmail: e.target.value })}
                placeholder="client@example.com"
              />
              {!form.clientEmail.trim() && form.status === "closed" && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertTriangle className="size-3 shrink-0 text-amber-500" /> Without an email no contract is prepared, and the invoice can&apos;t be sent until one is added.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dd-cc">Additional CCs</Label>
              <CcChipsInput field={cc} id="dd-cc" exclude={[form.clientEmail]} disabled={!pending} />
            </div>
          </Section>

          <Section
            title="Invoice"
            aside={
              invoice && pending ? (
                <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  <span className="text-xs text-muted-foreground">
                    {resetInvoice
                      ? "Regenerates on save"
                      : invoiceTouched
                      ? "Your lines are used as-is"
                      : draft.invoice
                      ? "Proposed lines"
                      : "Generated from value + services"}
                  </span>
                  {!resetInvoice && (invoiceTouched || draft.invoice) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={resetToGenerated}
                      disabled={busy !== null}
                      className="h-9 sm:h-6"
                      title="Drop the proposed/edited lines — the invoice is generated from the deal value + services"
                    >
                      Reset to generated lines
                    </Button>
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
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <AlertTriangle className="size-3 shrink-0 text-amber-500" /> Invoice total differs from the deal value.
                  </p>
                )}
                {pending && resetInvoice ? (
                  <p className="text-xs text-muted-foreground">
                    Save (or approve) to replace these lines with ones generated from the deal value + services.
                  </p>
                ) : (
                  pending &&
                  dirty &&
                  !invoiceTouched && (
                    <p className="text-xs text-muted-foreground">
                      Changed the value or services? Save to refresh the generated lines.
                    </p>
                  )
                )}
              </>
            )}
          </Section>

          {draft.status === "approved" && draft.dealId && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5 text-emerald-500" /> Approved — the deal is in the queue.
            </p>
          )}
        </div>
      )}
    </InvoiceDrawerShell>
  );
}
