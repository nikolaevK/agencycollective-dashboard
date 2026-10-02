"use client";

import { useEffect, useState, useRef, type ReactNode } from "react";
import { pdf } from "@react-pdf/renderer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Download, Eye, Loader2, Check, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { InvoicePdfDocument } from "@/components/invoice/pdf/InvoicePdfTemplate";
import { InvoiceDrawerShell } from "@/components/invoice/InvoiceDrawerShell";
import { InvoicePreviewDialog } from "@/components/invoice/InvoicePreviewDialog";
import { InvoiceTotalsSummary } from "@/components/invoice/InvoiceTotalsSummary";
import { InvoiceNotesFields } from "@/components/invoice/InvoiceNotesFields";
import { LineItemsEditor } from "@/components/invoice/LineItemsEditor";
import { CcChipsInput, useCcField } from "@/components/invoice/CcChipsInput";
import {
  AttachmentPicker,
  useEmailAttachments,
} from "@/components/invoice/AttachmentPicker";
import { DiscountField } from "@/components/invoice/InvoiceChargesForm";
import {
  InvoiceStyleSelect,
  profilePaymentBlock,
} from "@/components/invoice/InvoiceStyleSelect";
import { fetchInvoiceDraft, saveInvoiceDraft, type InvoiceDraftView } from "@/components/invoice/invoiceDraftClient";
import { InvoiceDraftBanner } from "@/components/invoice/InvoiceDraftBanner";
import { calculateTotals } from "@/lib/invoice/validation";
import { isValidEmail } from "@/lib/invoice/email";
import type { AgencyProfileRecord } from "@/lib/invoiceAgencyProfiles";
import type {
  DiscountDetails,
  InvoiceData,
  InvoiceItem,
  InvoiceSender,
  PaymentInfo,
  PaymentType,
} from "@/types/invoice";

const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";
const LABEL = "text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block";

interface Props {
  userId: string;
  clientName: string;
  onClose: () => void;
  onSent: () => void;
  /** Open a saved/agent-prepared draft instead of a fresh prefill. */
  draftId?: string | null;
  /** A draft was saved (refresh any drafts list). */
  onDraftSaved?: () => void;
}

async function fetchPrefill(
  userId: string,
  paymentType: PaymentType
): Promise<{ invoiceData: InvoiceData; brand: string }> {
  const res = await fetch(
    `/api/admin/clients/${userId}/invoice/prefill?paymentType=${paymentType}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function ClientInvoiceDrawer({ userId, clientName, onClose, onSent, draftId: initialDraftId = null, onDraftSaved }: Props) {
  const queryClient = useQueryClient();
  const [data, setDataRaw] = useState<InvoiceData | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>("local");
  // Invoice style — null = default Agency Collective, otherwise a saved
  // agency profile (e.g. PepAds) whose shell is applied to the PDF.
  const [styleProfile, setStyleProfile] = useState<AgencyProfileRecord | null>(null);
  // Default AC shell + payment blocks captured from the prefill, so switching
  // back from a profile restores them without guessing.
  const defaultStyleRef = useRef<{
    sender: InvoiceSender;
    logo: string;
    themeColor: string;
  } | null>(null);
  const defaultPaymentRef = useRef<Partial<Record<PaymentType, PaymentInfo>>>({});
  // CC edits count as unsaved changes (close confirm), like every other input.
  const cc = useCcField(undefined, () => setDirty(true));
  const attach = useEmailAttachments();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "download" | "send" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [savedOk, setSavedOk] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // The draft this drawer edits (agent-prepared, or created by "Save draft").
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [draft, setDraft] = useState<InvoiceDraftView | null>(null);
  const pendingStyleIdRef = useRef<string | null>(null);
  const paymentReq = useRef(0);
  const mounted = useRef(true);
  // Post-send auto-close timer — cleared on close/unmount so it can't close a
  // drawer opened afterwards (e.g. the next draft in the queue).
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      mounted.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  function close() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    onClose();
  }

  const { data: profiles = [] } = useQuery<AgencyProfileRecord[]>({
    queryKey: ["invoice-agency-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/invoice-agency-profiles");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()).data ?? [];
    },
    staleTime: 60_000,
  });

  /** User edit. */
  function setData(updater: (d: InvoiceData | null) => InvoiceData | null) {
    setDataRaw(updater);
    setDirty(true);
  }

  // Initial load: the draft (if any) + the default prefill (its shell and
  // payment block are what switching back to the default style restores).
  useEffect(() => {
    let active = true;
    Promise.all([
      fetchPrefill(userId, "local"),
      initialDraftId ? fetchInvoiceDraft(initialDraftId) : Promise.resolve(null),
    ])
      .then(([d, loadedDraft]) => {
        if (!active) return;
        defaultStyleRef.current = {
          sender: d.invoiceData.sender,
          logo: d.invoiceData.details.invoiceLogo,
          themeColor: d.invoiceData.details.themeColor,
        };
        if (d.invoiceData.details.paymentInfo) {
          defaultPaymentRef.current.local = d.invoiceData.details.paymentInfo;
        }
        if (loadedDraft) {
          setDraft(loadedDraft);
          setPaymentType(loadedDraft.paymentType);
          cc.setEmails(loadedDraft.ccEmails);
          pendingStyleIdRef.current = loadedDraft.options.styleProfileId ?? null;
          const dd = loadedDraft.invoiceData;
          const email = loadedDraft.recipientEmail ?? dd.receiver.email;
          setDataRaw({ ...dd, receiver: { ...dd.receiver, email: email ?? "" } });
          return;
        }
        // Server runs in UTC; default the invoice date to the admin's LOCAL
        // date so an evening send doesn't print tomorrow's date.
        const t = new Date();
        const localToday = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
        setDataRaw({
          ...d.invoiceData,
          details: { ...d.invoiceData.details, invoiceDate: localToday },
        });
      })
      .catch((e) => active && setError(e instanceof Error && initialDraftId ? `Failed to load draft: ${e.message}` : "Failed to load invoice."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, initialDraftId]);

  // A reopened draft remembers its style — restore the selection once the
  // profiles load (the PDF shell is already in the draft's data).
  useEffect(() => {
    const id = pendingStyleIdRef.current;
    if (!id || profiles.length === 0) return;
    const p = profiles.find((x) => x.id === id);
    if (p) setStyleProfile(p);
    pendingStyleIdRef.current = null;
  }, [profiles]);

  // --- mutations on the in-memory invoice -----------------------------------
  function patchDetails(patch: Partial<InvoiceData["details"]>) {
    setData((d) => (d ? { ...d, details: { ...d.details, ...patch } } : d));
  }
  function patchReceiver(patch: Partial<InvoiceData["receiver"]>) {
    setData((d) => (d ? { ...d, receiver: { ...d.receiver, ...patch } } : d));
  }
  function setItems(items: InvoiceItem[]) {
    setData((d) => {
      if (!d) return d;
      const { subTotal, totalAmount } = calculateTotals(
        items,
        d.details.discountDetails,
        d.details.taxDetails,
        d.details.shippingDetails
      );
      return { ...d, details: { ...d.details, items, subTotal, totalAmount } };
    });
  }
  function setDiscount(discountDetails: DiscountDetails | null) {
    setData((d) => {
      if (!d) return d;
      const { subTotal, totalAmount } = calculateTotals(
        d.details.items,
        discountDetails,
        d.details.taxDetails,
        d.details.shippingDetails
      );
      return {
        ...d,
        details: { ...d.details, discountDetails, subTotal, totalAmount },
      };
    });
  }

  // Switch the invoice shell (sender / logo / theme / payment block) between
  // the default Agency Collective identity and a saved agency profile.
  // Recipient, dates and line items are untouched; email sending is unchanged.
  async function applyStyle(profile: AgencyProfileRecord | null) {
    setStyleProfile(profile);
    // Invalidate any in-flight payment-block fetch so it can't overwrite us.
    const reqId = ++paymentReq.current;
    if (profile) {
      const block = profilePaymentBlock(profile, paymentType);
      setData((d) =>
        d
          ? {
              ...d,
              sender: { ...profile.sender, customInputs: d.sender.customInputs ?? [] },
              details: {
                ...d.details,
                invoiceLogo: profile.logo || d.details.invoiceLogo,
                themeColor: profile.themeColor || d.details.themeColor,
                // A blank profile template keeps the current block (mirrors
                // the Invoice page's applyProfile).
                ...(block ? { paymentInfo: block } : {}),
              },
            }
          : d
      );
      return;
    }
    const defaults = defaultStyleRef.current;
    if (!defaults) return;
    const cached = defaultPaymentRef.current[paymentType];
    setData((d) =>
      d
        ? {
            ...d,
            sender: { ...defaults.sender, customInputs: d.sender.customInputs ?? [] },
            details: {
              ...d.details,
              invoiceLogo: defaults.logo,
              themeColor: defaults.themeColor,
              ...(cached ? { paymentInfo: cached } : {}),
            },
          }
        : d
    );
    if (!cached) {
      // The default block for this payment type was never fetched (the drawer
      // only prefetches local) — pull it now.
      try {
        const d = await fetchPrefill(userId, paymentType);
        if (!mounted.current || reqId !== paymentReq.current) return;
        const block = d.invoiceData.details.paymentInfo;
        if (block) {
          defaultPaymentRef.current[paymentType] = block;
          patchDetails({ paymentInfo: block });
        }
      } catch {
        /* keep existing payment info */
      }
    }
  }

  // Switching payment type re-pulls just the payment-instructions block,
  // preserving the admin's line-item / recipient edits. Under a profile style
  // the block comes from the profile's template instead.
  async function changePaymentType(next: PaymentType) {
    const prev = paymentType;
    setPaymentType(next);
    setDirty(true);
    const reqId = ++paymentReq.current;
    if (styleProfile) {
      const block = profilePaymentBlock(styleProfile, next);
      if (block) patchDetails({ paymentInfo: block });
      return;
    }
    const cached = defaultPaymentRef.current[next];
    if (cached) {
      patchDetails({ paymentInfo: cached });
      return;
    }
    try {
      const d = await fetchPrefill(userId, next);
      if (!mounted.current || reqId !== paymentReq.current) return; // unmounted, or a newer toggle won
      const block = d.invoiceData.details.paymentInfo;
      if (!block) throw new Error("No payment details");
      defaultPaymentRef.current[next] = block;
      patchDetails({ paymentInfo: block });
    } catch {
      if (!mounted.current || reqId !== paymentReq.current) return;
      // Never leave the toggle on a type whose block isn't on the invoice —
      // the PDF/email would carry the previous type's bank details.
      setPaymentType(prev);
      setError(`Couldn't load ${next} payment details`);
    }
  }

  async function handleDownload() {
    if (!data) return;
    setBusy("download");
    try {
      const url = URL.createObjectURL(await pdf(<InvoicePdfDocument data={data} />).toBlob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${data.details.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveDraft() {
    if (!data) return;
    // Commit a typed-but-not-committed CC so the draft doesn't drop it.
    const finalCcs = cc.finalize([data.receiver.email.trim()]);
    if (!finalCcs) {
      setError("Fix the CC field before saving.");
      return;
    }
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const saved = await saveInvoiceDraft({
        draftId,
        kind: "client_rebill",
        userId,
        invoiceData: data,
        recipientEmail: data.receiver.email,
        ccEmails: finalCcs,
        paymentType,
        options: { styleProfileId: styleProfile?.id ?? null },
      });
      setDraftId(saved.id);
      setDirty(false);
      setNotice({ type: "success", text: draftId ? "Draft updated" : "Draft saved — it's listed under Drafts until someone sends it" });
      queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
      onDraftSaved?.();
    } catch (e) {
      // e.g. 409 — the draft was sent/rejected or is mid-send elsewhere.
      if (draftId) queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
      setError(e instanceof Error ? `Couldn't save draft: ${e.message}` : "Couldn't save draft");
    } finally {
      setBusy(null);
    }
  }

  async function handleSend() {
    if (!data || sent) return;
    const email = data.receiver.email.trim();
    if (!isValidEmail(email)) {
      setError("A valid client email is required to send.");
      return;
    }
    if (data.details.items.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    // Flush a typed-but-not-committed CC so it isn't dropped.
    const finalCcs = cc.finalize([email]);
    if (!finalCcs) {
      setError("Fix the CC field before sending.");
      return;
    }

    setError(null);
    setNotice(null);
    setBusy("send");
    try {
      const blob = await pdf(<InvoicePdfDocument data={data} />).toBlob();
      const fd = new FormData();
      fd.set("email", email);
      fd.set("invoiceNumber", data.details.invoiceNumber);
      // Amount in cents — feeds the client_rebill_invoices record so the Sent
      // Invoices panel can show the total without re-parsing the PDF. Server
      // re-validates and clamps.
      fd.set(
        "amountCents",
        String(Math.max(0, Math.round((data.details.totalAmount ?? 0) * 100)))
      );
      fd.set("pdf", new File([blob], `invoice-${data.details.invoiceNumber}.pdf`, { type: "application/pdf" }));
      // Brand the email like the PDF (subject/body/sign-off) — the server
      // resolves the profile itself; only the id crosses the wire.
      if (styleProfile) fd.set("styleProfileId", styleProfile.id);
      // Sending a reviewed draft stamps it sent (server refuses a draft that
      // was already sent or rejected).
      if (draftId) fd.set("draftId", draftId);
      for (const c of finalCcs) fd.append("cc", c);
      // Additional email attachments (transient — not filed in Documents).
      // Server re-validates count/size/extension; this is just the wire format.
      for (const file of attach.attachments) fd.append("attachments", file);
      const res = await fetch(`/api/admin/clients/${userId}/invoice/send`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 = the draft was already sent/rejected or is being sent by
        // someone else (refused before any email) — refresh the drafts list.
        if (res.status === 409 && draftId) queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const ok = j.saved !== false;
      setSavedOk(ok);
      setSent(true);
      setDirty(false);
      if (draftId) queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
      onSent();
      // Keep the drawer open if filing the copy failed so the amber notice is
      // seen; otherwise auto-close.
      if (ok) closeTimer.current = setTimeout(close, 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invoice.");
    } finally {
      setBusy(null);
    }
  }

  const currency = data?.details.currency ?? "USD";
  const draftReviewed = !!draft && draft.status !== "pending";

  const footer = data ? (
    <div className="space-y-2">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && !error && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            notice.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {notice.text}
        </div>
      )}
      {sent && (
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm",
            savedOk
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          )}
        >
          <Check className="h-4 w-4" />
          {savedOk
            ? "Invoice sent and filed."
            : "Invoice emailed, but filing the copy failed."}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && !sent && (
          <span className="mr-auto text-[11px] font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>
        )}
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={busy !== null || sent || draftReviewed}
          title="Save without sending — it waits under Drafts for review"
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {draftId ? "Update draft" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <Eye className="h-4 w-4" /> Preview
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={busy !== null || sent || draftReviewed}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {busy === "send" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : sent ? (
            <Check className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {busy === "send" ? "Sending…" : sent ? "Sent" : draft ? "Approve & send" : "Send invoice"}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <InvoiceDrawerShell
        title={draft ? "Review invoice draft" : "Re-bill invoice"}
        size="lg"
        badges={
          draft ? (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
              {draft.status === "pending" ? "Draft" : draft.status === "sent" ? "Draft · sent" : "Draft · rejected"}
            </span>
          ) : undefined
        }
        subtitle={
          <>
            {clientName}
            {data ? ` · ${data.details.invoiceNumber}` : ""}
          </>
        }
        onClose={close}
        dirty={dirty && !sent}
        busy={busy === "send"}
        preview={data}
        footer={footer}
      >
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        ) : !data ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-destructive">{error ?? "Failed to load invoice."}</p>
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {draft && <InvoiceDraftBanner draft={draft} />}

            <Section title="Recipient">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rebill-billto" className={LABEL}>Bill to</label>
                  <input
                    id="rebill-billto"
                    className={FIELD}
                    value={data.receiver.name}
                    onChange={(e) => patchReceiver({ name: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="rebill-email" className={LABEL}>Client email</label>
                  <input
                    id="rebill-email"
                    className={cn(FIELD, data.receiver.email.trim() && !isValidEmail(data.receiver.email) && "border-destructive/60")}
                    type="email"
                    value={data.receiver.email}
                    onChange={(e) => patchReceiver({ email: e.target.value })}
                    placeholder="client@company.com"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="rebill-cc" className={LABEL}>CC (optional)</label>
                <CcChipsInput field={cc} id="rebill-cc" exclude={[data.receiver.email]} />
              </div>
              {/* Attachments (optional) — included with the email alongside the
                  invoice PDF. Not filed in the client's Documents tab; transient
                  send-time additions. */}
              <AttachmentPicker state={attach} />
            </Section>

            <Section title="Details">
              {/* Invoice style — default AC or a saved agency profile (e.g. PepAds) */}
              <InvoiceStyleSelect
                selectedId={styleProfile?.id ?? null}
                onSelect={applyStyle}
                paymentType={paymentType}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="rebill-date" className={LABEL}>Invoice date</label>
                  <input
                    id="rebill-date"
                    type="date"
                    className={FIELD}
                    value={data.details.invoiceDate}
                    onChange={(e) => patchDetails({ invoiceDate: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="rebill-due" className={LABEL}>Due date</label>
                  <input
                    id="rebill-due"
                    type="date"
                    className={FIELD}
                    value={data.details.dueDate}
                    onChange={(e) => patchDetails({ dueDate: e.target.value })}
                  />
                </div>
                <div>
                  <span className={LABEL}>Payment</span>
                  <div className="flex rounded-lg border bg-background p-0.5">
                    {(["local", "international"] as PaymentType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={paymentType === t}
                        onClick={() => changePaymentType(t)}
                        className={cn(
                          "h-9 flex-1 rounded-md px-2 py-1.5 text-xs font-semibold capitalize transition-colors sm:h-auto",
                          paymentType === t
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Line items">
              <LineItemsEditor
                items={data.details.items}
                currency={currency}
                onChange={setItems}
                onNotice={setNotice}
              />
            </Section>

            <Section title="Discount & notes">
              {/* Discount (optional) — the same control the Invoice page uses;
                  feeds the shared calculateTotals so the PDF and live total
                  stay in sync. */}
              <DiscountField discount={data.details.discountDetails} onChange={setDiscount} />
              <InvoiceNotesFields
                idPrefix="rebill"
                paymentTerms={data.details.paymentTerms}
                additionalNotes={data.details.additionalNotes}
                onChange={(patch) => patchDetails(patch)}
              />
              <InvoiceTotalsSummary details={data.details} />
            </Section>
          </div>
        )}
      </InvoiceDrawerShell>

      {previewOpen && data && (
        <InvoicePreviewDialog
          data={data}
          initialMode="pdf"
          title={`Re-bill invoice · ${clientName}`}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
