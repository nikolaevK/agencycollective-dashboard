"use client";

import { useEffect, useState, useRef, type ReactNode } from "react";
import { pdf } from "@react-pdf/renderer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Download, Eye, Loader2, Check, Save, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "./format";
import { splitOpenInvoices, type OpenInvoiceRef } from "./openInvoices";
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
import { StatusBadge, badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirm } from "@/components/ui/use-confirm";

// Segmented control look (TabsList-style track + raised active pill) for the
// Local/International payment switch — same as the deal invoice drawer.
const SEGMENT_TRACK = "rounded-3xl bg-muted p-1";
const SEGMENT_ITEM =
  "h-9 sm:h-7 rounded-full px-3 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm";

// Draft status → badge tone (pending waits for review, sent, rejected).
const DRAFT_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  sent: "success",
  rejected: "danger",
};

const NOTICE = "rounded-2xl border px-4 py-3 text-sm";

interface Props {
  userId: string;
  clientName: string;
  onClose: () => void;
  onSent: () => void;
  /** Open a saved/agent-prepared draft instead of a fresh prefill. */
  draftId?: string | null;
  /** A draft was saved (refresh any drafts list). */
  onDraftSaved?: () => void;
  /**
   * The client's invoices still awaiting payment (any cycle). One for the
   * send's cycle is replaced automatically (kept in history as Superseded);
   * other cycles are kept unless ticked — same-month ones come pre-ticked
   * (see splitOpenInvoices).
   */
  openInvoices?: OpenInvoiceRef[];
  /** The cycle this send is recorded under (the schedule's nextRebillAt). */
  currentCycleAnchor?: string | null;
  /** Switch to following up on an awaiting invoice instead of re-sending. */
  onFollowUpInstead?: (invoiceId: string) => void;
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
  // overflow-visible: dropdowns inside (preset services, style picker) must
  // not be clipped.
  return (
    <Card className="overflow-visible">
      <section className="space-y-4 p-4">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        {children}
      </section>
    </Card>
  );
}

export function ClientInvoiceDrawer({
  userId,
  clientName,
  onClose,
  onSent,
  draftId: initialDraftId = null,
  onDraftSaved,
  openInvoices = [],
  currentCycleAnchor = null,
  onFollowUpInstead,
}: Props) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
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
  // The email went out but the lifecycle row wasn't written (no "Invoice
  // sent" status / follow-ups until it's registered).
  const [recordedOk, setRecordedOk] = useState(true);
  const { replaced, others: otherOpenInvoices, sameMonthIds } = splitOpenInvoices(
    openInvoices,
    currentCycleAnchor
  );
  // Other-cycle invoices this send re-issues. Same-month ones are pre-ticked
  // (re-seeded if the open list changes, until the admin touches a box).
  const [replaceIds, setReplaceIds] = useState<string[]>(sameMonthIds);
  const [replaceTouched, setReplaceTouched] = useState(false);
  const sameMonthKey = sameMonthIds.join(",");
  useEffect(() => {
    if (!replaceTouched) setReplaceIds(sameMonthKey ? sameMonthKey.split(",") : []);
  }, [sameMonthKey, replaceTouched]);
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
      for (const id of replaceIds)
        if (otherOpenInvoices.some((i) => i.id === id)) fd.append("replaceInvoiceId", id);
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
      const ok = j.saved !== false && j.recorded !== false;
      setSavedOk(j.saved !== false);
      setRecordedOk(j.recorded !== false);
      setSent(true);
      setDirty(false);
      if (draftId) queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
      onSent();
      // Keep the drawer open if filing the copy or recording the send failed
      // so the amber notice is seen; otherwise auto-close.
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
    <div className="space-y-3">
      {error && <div className={cn(NOTICE, badgeTone.danger)}>{error}</div>}
      {notice && !error && (
        <div className={cn(NOTICE, notice.type === "success" ? badgeTone.success : badgeTone.danger)}>
          {notice.text}
        </div>
      )}
      {sent && (
        <div
          className={cn(
            NOTICE,
            "flex items-center gap-1.5",
            savedOk && recordedOk ? badgeTone.success : badgeTone.warning
          )}
        >
          <Check className="size-4 shrink-0" />
          {!recordedOk
            ? "Invoice emailed, but it wasn't recorded on the billing ledger — use “Register existing” so it shows as sent."
            : savedOk
            ? "Invoice sent and filed."
            : "Invoice emailed, but filing the copy failed."}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && !sent && (
          <span className="mr-auto text-xs font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={handleSaveDraft}
          disabled={busy !== null || sent || draftReviewed}
          title="Save without sending — it waits under Drafts for review"
        >
          {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
          {draftId ? "Update draft" : "Save draft"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
          <Eye /> Preview
        </Button>
        <Button type="button" variant="outline" onClick={handleDownload} disabled={busy !== null}>
          {busy === "download" ? <Loader2 className="animate-spin" /> : <Download />} PDF
        </Button>
        <Button type="button" onClick={handleSend} disabled={busy !== null || sent || draftReviewed}>
          {busy === "send" ? <Loader2 className="animate-spin" /> : sent ? <Check /> : <Send />}
          {busy === "send" ? "Sending…" : sent ? "Sent" : draft ? "Approve & send" : "Send invoice"}
        </Button>
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
            <StatusBadge tone={DRAFT_TONE[draft.status] ?? "neutral"}>
              {draft.status === "pending" ? "Draft" : draft.status === "sent" ? "Draft · sent" : "Draft · rejected"}
            </StatusBadge>
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
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-3xl" />
            ))}
          </div>
        ) : !data ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-sm text-destructive">{error ?? "Failed to load invoice."}</p>
            <Button type="button" variant="outline" onClick={close}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {draft && <InvoiceDraftBanner draft={draft} />}
            {replaced.map((inv) => (
              <div key={inv.id} className={cn(NOTICE, "text-xs", badgeTone.warning)}>
                <p>
                  <span className="font-medium">{inv.invoiceNumber}</span> was already sent{" "}
                  {formatDate(inv.sentAt)} for the {formatDate(inv.cycleAnchor)} cycle and is
                  awaiting payment. Sending this invoice replaces it — the original is kept in
                  history as Superseded.
                </p>
                {onFollowUpInstead && (
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={async () => {
                      if (dirty && !(await confirm({ title: "Discard your changes to this invoice?", destructive: true, confirmText: "Discard" }))) return;
                      onFollowUpInstead(inv.id);
                    }}
                    className="mt-1.5 h-auto whitespace-normal px-0 text-left text-xs text-inherit underline hover:text-foreground"
                  >
                    <BellRing />
                    Just chasing payment? Send a follow-up instead
                  </Button>
                )}
              </div>
            ))}
            {otherOpenInvoices.length > 0 && (
              <div className="rounded-2xl bg-muted/50 p-3 text-xs">
                <p className="text-muted-foreground">
                  Also awaiting payment — kept as-is unless this invoice re-issues one of them
                  {sameMonthIds.length > 0 && " (same-month invoices are pre-selected)"}:
                </p>
                <ul className="mt-2 space-y-1.5">
                  {otherOpenInvoices.map((inv) => (
                    <li key={inv.id}>
                      <label className="flex items-start gap-2 text-foreground">
                        <Checkbox
                          className="mt-px"
                          checked={replaceIds.includes(inv.id)}
                          disabled={sent || busy !== null}
                          onCheckedChange={(v) => {
                            setReplaceTouched(true);
                            setReplaceIds((ids) =>
                              v === true ? [...ids, inv.id] : ids.filter((x) => x !== inv.id)
                            );
                          }}
                        />
                        <span>
                          Replace <span className="font-medium">{inv.invoiceNumber}</span>{" "}
                          <span className="text-muted-foreground">
                            (cycle {formatDate(inv.cycleAnchor)}, sent {formatDate(inv.sentAt)}) — it
                            stays in history as Superseded
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Section title="Recipient">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="rebill-billto">Bill to</Label>
                  <Input
                    id="rebill-billto"
                    value={data.receiver.name}
                    onChange={(e) => patchReceiver({ name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rebill-email">Client email</Label>
                  <Input
                    id="rebill-email"
                    aria-invalid={data.receiver.email.trim() && !isValidEmail(data.receiver.email) ? true : undefined}
                    type="email"
                    value={data.receiver.email}
                    onChange={(e) => patchReceiver({ email: e.target.value })}
                    placeholder="client@company.com"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rebill-cc">
                  CC <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
                <div className="grid gap-2">
                  <Label htmlFor="rebill-date">Invoice date</Label>
                  <DatePicker
                    id="rebill-date"
                    value={data.details.invoiceDate}
                    onValueChange={(v) => patchDetails({ invoiceDate: v })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rebill-due">Due date</Label>
                  <DatePicker
                    id="rebill-due"
                    value={data.details.dueDate}
                    onValueChange={(v) => patchDetails({ dueDate: v })}
                  />
                </div>
                <div className="grid gap-2">
                  <span className="text-sm font-medium leading-none">Payment</span>
                  <ToggleGroup
                    type="single"
                    // Each option stays its own Tab stop, as the old buttons were.
                    rovingFocus={false}
                    value={paymentType}
                    // Radix reports "" when the selected option is clicked
                    // again; the old buttons re-applied that type then, so
                    // keep doing that.
                    onValueChange={(v) => changePaymentType((v || paymentType) as PaymentType)}
                    aria-label="Payment"
                    className={cn("w-full", SEGMENT_TRACK)}
                  >
                    {(["local", "international"] as PaymentType[]).map((t) => (
                      <ToggleGroupItem key={t} value={t} className={cn(SEGMENT_ITEM, "min-w-0 flex-1 px-2 capitalize")}>
                        {t}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
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
      {dialog}
    </>
  );
}
