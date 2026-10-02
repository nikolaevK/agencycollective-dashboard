"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { pdf } from "@react-pdf/renderer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Download, Eye, Loader2, Check, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { InvoicePdfDocument } from "@/components/invoice/pdf/InvoicePdfTemplate";
import { InvoiceDrawerShell } from "@/components/invoice/InvoiceDrawerShell";
import { InvoicePreviewDialog } from "@/components/invoice/InvoicePreviewDialog";
import { InvoiceTotalsSummary } from "@/components/invoice/InvoiceTotalsSummary";
import { InvoiceNotesFields } from "@/components/invoice/InvoiceNotesFields";
import { InvoiceDraftBanner } from "@/components/invoice/InvoiceDraftBanner";
import { LineItemsEditor } from "@/components/invoice/LineItemsEditor";
import { CcChipsInput, useCcField } from "@/components/invoice/CcChipsInput";
import { DiscountField } from "@/components/invoice/InvoiceChargesForm";
import {
  AttachmentPicker,
  useEmailAttachments,
} from "@/components/invoice/AttachmentPicker";
import {
  InvoiceStyleSelect,
  profilePaymentBlock,
} from "@/components/invoice/InvoiceStyleSelect";
import { fetchInvoiceDraft, saveInvoiceDraft, type InvoiceDraftView } from "@/components/invoice/invoiceDraftClient";
import { calculateTotals, createEmptyItem } from "@/lib/invoice/validation";
import { isValidEmail } from "@/lib/invoice/email";
import type { AgencyProfileRecord } from "@/lib/invoiceAgencyProfiles";
import type {
  DiscountDetails,
  InvoiceData,
  InvoiceItem,
  InvoiceSender,
  PaymentType,
  PaymentInfo,
} from "@/types/invoice";
import { buildAdAccountLineItems } from "@/lib/adAccountLineItem";
import { cycleOptionsAround } from "@/lib/clientBilling";
import { formatDate } from "./format";

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";
const LABEL =
  "text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block";

// Ad-spend fee options: 2.0%–7.0% in 0.5% steps (basis points).
const FEE_OPTIONS: { bps: number; label: string }[] = [];
for (let bps = 200; bps <= 700; bps += 50) {
  FEE_OPTIONS.push({ bps, label: `${(bps / 100).toFixed(1)}%` });
}

function sameLines(a: InvoiceItem[], b: InvoiceItem[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (x, i) =>
        x.id === b[i].id &&
        x.name === b[i].name &&
        x.description === b[i].description &&
        x.quantity === b[i].quantity &&
        x.unitPrice === b[i].unitPrice
    )
  );
}

/** Typed dollars → non-negative cents (min="0" doesn't stop typing "-5"). */
function dollarsToCents(v: string): number {
  return Math.max(0, Math.round((Number(v) || 0) * 100));
}

export interface AdAccountInvoiceTarget {
  id: string;
  accountName: string;
  vendor: string | null;
  adSpendFeeBps: number;
  monthlyRetainerCents: number;
  clientName: string | null;
  clientEmail: string | null;
  /** The account's computed next bill date — default billing cycle for the
   *  invoice; the drawer lets the admin pick a previous/future cycle. */
  nextRebillAt?: string | null;
}

interface Props {
  /** Attached ad account, or null for a free invoice. */
  adAccount: AdAccountInvoiceTarget | null;
  onClose: () => void;
  onSent: () => void;
  /** Open a saved/agent-prepared draft (attached accounts only). */
  draftId?: string | null;
  onDraftSaved?: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function AdAccountInvoiceDrawer({ adAccount, onClose, onSent, draftId: initialDraftId = null, onDraftSaved }: Props) {
  const isFree = !adAccount;
  const queryClient = useQueryClient();

  const [data, setDataRaw] = useState<InvoiceData | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>("local");
  const [spendDollars, setSpendDollars] = useState("");
  const [feeBps, setFeeBps] = useState(adAccount?.adSpendFeeBps ?? 350);
  // Line-item context — drives the two canonical lines (retainer + ad-spend).
  const [accountName, setAccountName] = useState(adAccount?.accountName ?? "");
  const [vendor, setVendor] = useState(adAccount?.vendor ?? "");
  const [retainerDollars, setRetainerDollars] = useState(
    adAccount ? String(adAccount.monthlyRetainerCents / 100) : ""
  );

  // CC edits count as unsaved changes (close confirm), like every other input.
  const cc = useCcField(undefined, () => setDirty(true));
  const attach = useEmailAttachments();
  // Billing cycle the invoice covers. "" = let the server use the account's
  // computed next cycle (previous behaviour); any date overrides it.
  const [cycleAnchor, setCycleAnchor] = useState("");
  const cycleChoices = adAccount?.nextRebillAt ? cycleOptionsAround(adAccount.nextRebillAt) : [];

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "download" | "send" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [savedOk, setSavedOk] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [draft, setDraft] = useState<InvoiceDraftView | null>(null);
  const pendingStyleIdRef = useRef<string | null>(null);

  const paymentReqRef = useRef(0);
  // Both payment blocks (local + international) are fetched once at load and
  // cached here, so toggling switches instantly and can never silently leave
  // the invoice on the local block if a per-toggle fetch fails.
  const paymentInfoCacheRef = useRef<Partial<Record<PaymentType, PaymentInfo>>>({});
  const readyRef = useRef(false);
  // Stable ids for the two canonical lines, so we can reconcile them against
  // any extra admin-added line items without churning keys or losing extras.
  const retainerIdRef = useRef<string | null>(null);
  const adSpendIdRef = useRef<string | null>(null);
  if (retainerIdRef.current === null) retainerIdRef.current = createEmptyItem().id;
  if (adSpendIdRef.current === null) adSpendIdRef.current = createEmptyItem().id;
  const providerRef = useRef<string>("Agency Collective");
  // Invoice style — null = default Agency Collective, otherwise a saved
  // agency profile (e.g. PepAds) whose shell is applied to the PDF.
  const [styleProfile, setStyleProfile] = useState<AgencyProfileRecord | null>(null);
  // Default AC shell + provider captured from the prefill, so switching back
  // from a profile restores them (payment blocks live in paymentInfoCacheRef).
  const defaultStyleRef = useRef<{
    sender: InvoiceSender;
    logo: string;
    themeColor: string;
  } | null>(null);
  const defaultProviderRef = useRef<string>("Agency Collective");
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

  const retainerCents = dollarsToCents(retainerDollars);
  const spendCents = dollarsToCents(spendDollars);

  /** User edit of the invoice. */
  function setData(updater: (d: InvoiceData | null) => InvoiceData | null) {
    setDataRaw(updater);
    setDirty(true);
  }

  /** Items with totals recomputed — discount included (same engine as the PDF). */
  function withItems(d: InvoiceData, items: InvoiceItem[]): InvoiceData {
    const { subTotal, totalAmount } = calculateTotals(
      items,
      d.details.discountDetails,
      d.details.taxDetails,
      d.details.shippingDetails
    );
    return { ...d, details: { ...d.details, items, subTotal, totalAmount } };
  }

  // The two canonical lines (retainer + ad-spend fee) for the current inputs.
  function makeCanonicalItems(): InvoiceItem[] {
    return buildAdAccountLineItems({
      retainerId: retainerIdRef.current!,
      adSpendId: adSpendIdRef.current!,
      accountName,
      vendor,
      monthlyRetainerCents: retainerCents,
      spendCents,
      feeBps,
      serviceProvider: providerRef.current,
    });
  }
  const isCanonical = (id: string) => id === retainerIdRef.current || id === adSpendIdRef.current;

  // Build the prefill query (only used for the shell: sender / payment / logo /
  // receiver / invoice number — line items are computed locally).
  function prefillUrl(pt: PaymentType): string {
    const p = new URLSearchParams();
    p.set("paymentType", pt);
    if (adAccount) p.set("adAccountId", adAccount.id);
    return `/api/admin/ad-accounts/invoice/prefill?${p.toString()}`;
  }

  // Initial load — fetch BOTH payment variants up front: the local one seeds the
  // full invoice shell, and both payment blocks are cached so the Local/
  // International toggle is instant and reliable (no per-toggle fetch that could
  // fail and silently leave the wrong block in place). A draft, when opened,
  // supplies the invoice itself and the component inputs.
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(prefillUrl("local")).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      // International is best-effort — if it fails we fall back to fetching it
      // lazily on first toggle.
      fetch(prefillUrl("international"))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      initialDraftId ? fetchInvoiceDraft(initialDraftId) : Promise.resolve(null),
    ])
      .then(([localJson, intlJson, loadedDraft]) => {
        if (!active) return;
        const d = localJson.data.invoiceData as InvoiceData;
        if (d.sender?.name) providerRef.current = d.sender.name;
        defaultProviderRef.current = providerRef.current;
        defaultStyleRef.current = {
          sender: d.sender,
          logo: d.details.invoiceLogo,
          themeColor: d.details.themeColor,
        };
        // Cache both payment blocks for instant, fail-proof switching.
        if (d.details.paymentInfo) paymentInfoCacheRef.current.local = d.details.paymentInfo;
        const intl = (intlJson?.data?.invoiceData as InvoiceData | undefined)?.details
          ?.paymentInfo;
        if (intl) paymentInfoCacheRef.current.international = intl;

        if (loadedDraft) {
          const o = loadedDraft.options;
          setDraft(loadedDraft);
          setPaymentType(loadedDraft.paymentType);
          cc.setEmails(loadedDraft.ccEmails);
          pendingStyleIdRef.current = o.styleProfileId ?? null;
          if (o.retainerCents !== undefined) setRetainerDollars(String(o.retainerCents / 100));
          if (o.spendCents !== undefined) setSpendDollars(o.spendCents ? String(o.spendCents / 100) : "");
          if (o.feeBps) setFeeBps(o.feeBps);
          if (o.cycleAnchor) setCycleAnchor(o.cycleAnchor);
          // The draft's generated lines keep their ids, so they stay the
          // computed (locked) lines instead of turning into duplicate extras.
          if (o.lineIds) {
            retainerIdRef.current = o.lineIds.retainer;
            adSpendIdRef.current = o.lineIds.adSpend;
          }
          const dd = loadedDraft.invoiceData;
          if (dd.sender?.name) providerRef.current = dd.sender.name;
          const email = loadedDraft.recipientEmail ?? dd.receiver.email;
          setDataRaw({ ...dd, receiver: { ...dd.receiver, email: email ?? "" } });
        } else {
          const localToday = todayYmd();
          // Own the line items locally (stable ids) from the start.
          const seeded = withItems(d, makeCanonicalItems());
          setDataRaw({ ...seeded, details: { ...seeded.details, invoiceDate: localToday } });
        }
        readyRef.current = true;
      })
      .catch((e) => active && setError(e instanceof Error && initialDraftId ? `Failed to load draft: ${e.message}` : "Failed to load invoice."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A reopened draft remembers its style — restore the selection once the
  // profiles load (the PDF shell is already in the draft's data).
  useEffect(() => {
    const id = pendingStyleIdRef.current;
    if (!id || profiles.length === 0) return;
    const p = profiles.find((x) => x.id === id);
    if (p) setStyleProfile(p);
    pendingStyleIdRef.current = null;
  }, [profiles]);

  // Recompute the canonical lines locally when spend / fee / retainer / context
  // changes — no network round-trip (no per-keystroke fetch storm). Canonical
  // lines (retainer + ad-spend, each present only when its amount > 0) are kept
  // at the front; any extra admin-added line items are preserved after them.
  useEffect(() => {
    if (!readyRef.current || !data) return;
    const desired = makeCanonicalItems();
    const current = data.details.items.filter((it) => isCanonical(it.id));
    // Opening a draft sets these inputs to the values its lines were built
    // from — nothing to change (and nothing should read as an edit).
    if (sameLines(current, desired)) return;
    setData((d) => {
      if (!d) return d;
      const extras = d.details.items.filter((it) => !isCanonical(it.id));
      return withItems(d, [...desired, ...extras]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendDollars, feeBps, accountName, vendor, retainerDollars]);

  function patchDetails(patch: Partial<InvoiceData["details"]>) {
    setData((d) => (d ? { ...d, details: { ...d.details, ...patch } } : d));
  }
  function patchReceiver(patch: Partial<InvoiceData["receiver"]>) {
    setData((d) => (d ? { ...d, receiver: { ...d.receiver, ...patch } } : d));
  }
  function setItems(items: InvoiceItem[]) {
    setData((d) => (d ? withItems(d, items) : d));
  }
  function setDiscount(discountDetails: DiscountDetails | null) {
    setData((d) => (d ? withItems({ ...d, details: { ...d.details, discountDetails } }, d.details.items) : d));
  }

  // Lazily fetch a default payment block that wasn't prefetched (e.g. the
  // initial international prefetch failed), cache it and patch it in.
  // Resolves true = applied, false = failed (existing block kept), null =
  // superseded by a newer toggle/style change (or unmounted).
  async function fetchDefaultPayment(type: PaymentType): Promise<boolean | null> {
    const reqId = ++paymentReqRef.current;
    const current = () => mounted.current && reqId === paymentReqRef.current;
    try {
      const res = await fetch(prefillUrl(type));
      if (!res.ok) return current() ? false : null;
      const json = await res.json();
      if (!current()) return null;
      const pi = (json.data.invoiceData as InvoiceData).details.paymentInfo;
      if (!pi) return false;
      paymentInfoCacheRef.current[type] = pi;
      patchDetails({ paymentInfo: pi });
      return true;
    } catch {
      return current() ? false : null;
    }
  }

  // Switch the invoice shell (sender / logo / theme / payment block / the
  // "Service provider" label in the canonical lines) between the default
  // Agency Collective identity and a saved agency profile. Recipient, amounts
  // and extra line items are untouched; email sending is unchanged.
  function applyStyle(profile: AgencyProfileRecord | null) {
    const defaults = defaultStyleRef.current;
    if (!defaults) return;
    setStyleProfile(profile);
    // Invalidate any in-flight payment-block fetch so it can't overwrite us.
    paymentReqRef.current++;
    providerRef.current = profile
      ? profile.sender.name || profile.name
      : defaultProviderRef.current;
    const desired = makeCanonicalItems();
    const sender = profile ? profile.sender : defaults.sender;
    const logo = profile ? profile.logo || defaults.logo : defaults.logo;
    const themeColor = profile
      ? profile.themeColor || defaults.themeColor
      : defaults.themeColor;
    // A blank profile template keeps the current block (mirrors the Invoice
    // page's applyProfile).
    const block = profile
      ? profilePaymentBlock(profile, paymentType)
      : paymentInfoCacheRef.current[paymentType] ?? null;
    setData((d) => {
      if (!d) return d;
      const extras = d.details.items.filter((it) => !isCanonical(it.id));
      const next = withItems(d, [...desired, ...extras]);
      return {
        ...next,
        sender: { ...sender, customInputs: d.sender.customInputs ?? [] },
        details: {
          ...next.details,
          invoiceLogo: logo,
          themeColor,
          ...(block ? { paymentInfo: block } : {}),
        },
      };
    });
    if (!profile && !block) void fetchDefaultPayment(paymentType);
  }

  async function changePaymentType(next: PaymentType) {
    const prev = paymentType;
    setPaymentType(next);
    setDirty(true);
    // Under a profile style the block comes from the profile's template.
    if (styleProfile) {
      paymentReqRef.current++;
      const block = profilePaymentBlock(styleProfile, next);
      if (block) patchDetails({ paymentInfo: block });
      return;
    }
    // Prefer the cached block — instant and reliable.
    const cached = paymentInfoCacheRef.current[next];
    if (cached) {
      paymentReqRef.current++; // an in-flight lazy fetch must not overwrite this
      patchDetails({ paymentInfo: cached });
      return;
    }
    // Never leave the toggle on a type whose block isn't on the invoice — the
    // PDF/email would carry the previous type's bank details.
    if ((await fetchDefaultPayment(next)) === false) {
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
    if (!data || !adAccount) return;
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
        kind: "ad_account",
        adAccountId: adAccount.id,
        invoiceData: data,
        recipientEmail: data.receiver.email,
        ccEmails: finalCcs,
        paymentType,
        options: {
          retainerCents,
          spendCents,
          feeBps,
          cycleAnchor: cycleAnchor || null,
          lineIds: { retainer: retainerIdRef.current!, adSpend: adSpendIdRef.current! },
          styleProfileId: styleProfile?.id ?? null,
        },
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
      setError("A valid recipient email is required to send.");
      return;
    }
    if (data.details.items.length === 0) {
      setError("Add at least one line item.");
      return;
    }
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
      fd.set("amountCents", String(Math.max(0, Math.round((data.details.totalAmount ?? 0) * 100))));
      if (adAccount) fd.set("adAccountId", adAccount.id);
      // Manual cycle selection (blank = server-computed next cycle).
      if (cycleAnchor) fd.set("cycleAnchor", cycleAnchor);
      // Components — the server derives the invoice type (retainer / ad_spend /
      // combined) and records the ad-spend detail from these.
      fd.set("retainerCents", String(retainerCents));
      fd.set("spendCents", String(spendCents));
      fd.set("feeBps", String(feeBps));
      // Brand/recipient hints for filing a free invoice's PDF.
      if (accountName) fd.set("brand", accountName);
      fd.set("recipientName", data.receiver.name);
      fd.set("pdf", new File([blob], `invoice-${data.details.invoiceNumber}.pdf`, { type: "application/pdf" }));
      // Brand the email like the PDF (subject/body/sign-off) — the server
      // resolves the profile itself; only the id crosses the wire.
      if (styleProfile) fd.set("styleProfileId", styleProfile.id);
      // Sending a reviewed draft stamps it sent (server refuses one that was
      // already sent or rejected).
      if (draftId) fd.set("draftId", draftId);
      for (const c of finalCcs) fd.append("cc", c);
      for (const file of attach.attachments) fd.append("attachments", file);

      const res = await fetch("/api/admin/ad-accounts/invoice/send", {
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
      // `saved` = PDF filed in Documents; `recorded` = tracking row written.
      // Either failing means the email went out but follow-up bookkeeping
      // didn't — keep the drawer open with the amber notice.
      const ok = j.saved !== false && j.recorded !== false;
      setSavedOk(ok);
      setSent(true);
      setDirty(false);
      // Per-account history + the cross-account "Sent invoices" panel would
      // otherwise stay stale until their own refetch.
      queryClient.invalidateQueries({ queryKey: ["admin-ad-account-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ad-account-sent-invoices"] });
      if (draftId) queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
      onSent();
      if (ok) closeTimer.current = setTimeout(close, 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invoice.");
    } finally {
      setBusy(null);
    }
  }

  const currency = data?.details.currency ?? "USD";
  const draftReviewed = !!draft && draft.status !== "pending";
  const lockedIds = [retainerIdRef.current!, adSpendIdRef.current!];

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
          {savedOk ? "Invoice sent and filed." : "Invoice emailed, but filing the copy failed."}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && !sent && (
          <span className="mr-auto text-[11px] font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>
        )}
        {adAccount && (
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
        )}
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
          {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : sent ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {busy === "send" ? "Sending…" : sent ? "Sent" : draft ? "Approve & send" : "Send invoice"}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <InvoiceDrawerShell
        title={draft ? "Review ad account invoice draft" : "Ad account invoice"}
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
            {isFree ? "No account attached" : adAccount!.accountName}
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

            {/* Invoice components — retainer + ad-spend fee. A line appears on
                the invoice only when its amount is greater than zero. */}
            <Section title="Invoice components">
              {/* Account context (free invoices type these in; attached accounts
                  show them read-only since they come from the account). */}
              {isFree && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="adinv-account" className={LABEL}>Account name</label>
                    <input
                      id="adinv-account"
                      className={FIELD}
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="OT_AC_brand-CC"
                    />
                  </div>
                  <div>
                    <label htmlFor="adinv-vendor" className={LABEL}>Vendor</label>
                    <input
                      id="adinv-vendor"
                      className={FIELD}
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      placeholder="ConceptSF"
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                <div>
                  <label htmlFor="adinv-retainer" className={LABEL}>Monthly retainer ($)</label>
                  <input
                    id="adinv-retainer"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className={FIELD}
                    value={retainerDollars}
                    onChange={(e) => setRetainerDollars(e.target.value.startsWith("-") ? "" : e.target.value)}
                    placeholder="1500"
                  />
                </div>
                <div>
                  <label htmlFor="adinv-spend" className={LABEL}>Ad spend ($)</label>
                  <input
                    id="adinv-spend"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className={FIELD}
                    value={spendDollars}
                    onChange={(e) => setSpendDollars(e.target.value.startsWith("-") ? "" : e.target.value)}
                    placeholder="41499.35"
                  />
                </div>
                <div>
                  <label htmlFor="adinv-fee" className={LABEL}>Ad spend fee %</label>
                  <select
                    id="adinv-fee"
                    className={FIELD}
                    value={feeBps}
                    onChange={(e) => setFeeBps(Number(e.target.value))}
                  >
                    {/* An off-grid stored fee still shows correctly. */}
                    {!FEE_OPTIONS.some((o) => o.bps === feeBps) && (
                      <option value={feeBps}>{(feeBps / 100).toFixed(2)}%</option>
                    )}
                    {FEE_OPTIONS.map((o) => (
                      <option key={o.bps} value={o.bps}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Leave retainer or ad spend at 0 to omit that line. These lines are calculated — edit them here, not in the line items below.
              </p>
            </Section>

            <Section title="Recipient">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adinv-billto" className={LABEL}>Bill to</label>
                  <input
                    id="adinv-billto"
                    className={FIELD}
                    value={data.receiver.name}
                    onChange={(e) => patchReceiver({ name: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="adinv-email" className={LABEL}>Recipient email</label>
                  <input
                    id="adinv-email"
                    className={cn(FIELD, data.receiver.email.trim() && !isValidEmail(data.receiver.email) && "border-destructive/60")}
                    type="email"
                    value={data.receiver.email}
                    onChange={(e) => patchReceiver({ email: e.target.value })}
                    placeholder="client@company.com"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="adinv-cc" className={LABEL}>CC (optional)</label>
                <CcChipsInput field={cc} id="adinv-cc" exclude={[data.receiver.email]} />
              </div>
              <AttachmentPicker state={attach} />
            </Section>

            <Section title="Details">
              {/* Billing cycle (attached accounts only) */}
              {adAccount && (
                <div>
                  <label htmlFor="adinv-cycle" className={LABEL}>Billing cycle</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      id="adinv-cycle"
                      className={FIELD}
                      value={
                        cycleAnchor === "" ||
                        cycleChoices.some((c) => c.offset !== 0 && c.date === cycleAnchor)
                          ? cycleAnchor
                          : "custom"
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setDirty(true);
                        if (v === "custom") setCycleAnchor(adAccount.nextRebillAt ?? todayYmd());
                        else setCycleAnchor(v);
                      }}
                    >
                      <option value="">
                        Next cycle{adAccount.nextRebillAt ? ` (${formatDate(adAccount.nextRebillAt)})` : ""} — default
                      </option>
                      {cycleChoices
                        .filter((c) => c.offset !== 0)
                        .map((c) => (
                          <option key={c.date} value={c.date}>
                            {formatDate(c.date)} ({c.offset < 0 ? "previous" : "future"})
                          </option>
                        ))}
                      <option value="custom">Custom date…</option>
                    </select>
                    {cycleAnchor !== "" && (
                      <input
                        type="date"
                        aria-label="Custom billing cycle date"
                        className={FIELD}
                        value={cycleAnchor}
                        onChange={(e) => {
                          setDirty(true);
                          setCycleAnchor(e.target.value);
                        }}
                      />
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Which monthly cycle this invoice covers. The default replaces the account&rsquo;s
                    current awaiting invoice (a re-send) and lights &ldquo;Invoice sent&rdquo;. Any
                    other cycle is recorded alongside it — for a delayed or upcoming month.
                  </p>
                </div>
              )}

              {/* Invoice style — default AC or a saved agency profile (e.g. PepAds) */}
              <InvoiceStyleSelect
                selectedId={styleProfile?.id ?? null}
                onSelect={applyStyle}
                paymentType={paymentType}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-end">
                <div>
                  <label htmlFor="adinv-date" className={LABEL}>Invoice date</label>
                  <input
                    id="adinv-date"
                    type="date"
                    className={FIELD}
                    value={data.details.invoiceDate}
                    onChange={(e) => patchDetails({ invoiceDate: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="adinv-due" className={LABEL}>Due date</label>
                  <input
                    id="adinv-due"
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
                lockedIds={lockedIds}
                onNotice={setNotice}
              />
            </Section>

            <Section title="Discount & notes">
              <DiscountField discount={data.details.discountDetails} onChange={setDiscount} />
              <InvoiceNotesFields
                idPrefix="adinv"
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
          title={`Ad account invoice${adAccount ? ` · ${adAccount.accountName}` : ""}`}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
