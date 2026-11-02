"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { pdf } from "@react-pdf/renderer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Download, Eye, Loader2, Check, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { splitOpenInvoices, type OpenInvoiceRef } from "./openInvoices";

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
// Segmented control look (TabsList-style track + raised active pill) for the
// Local/International payment switch — same as the deal invoice drawer.
const SEGMENT_TRACK = "rounded-3xl bg-muted p-1";
const SEGMENT_ITEM =
  "h-9 sm:h-7 rounded-full px-3 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm";

// Radix Select items can't carry an empty value — the "Next cycle — default"
// option (cycleAnchor "") maps to this.
const NEXT_CYCLE = "__next__";

// Draft status → badge tone (pending waits for review, sent, rejected).
const DRAFT_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  sent: "success",
  rejected: "danger",
};

const NOTICE = "rounded-2xl border px-4 py-3 text-sm";

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
  /** The account's invoices still awaiting payment (any cycle). */
  openInvoices?: OpenInvoiceRef[];
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
  // The account's awaiting invoices against the cycle this send is recorded
  // under: same cycle → replaced by the send; other cycles → kept unless
  // ticked, same-month ones pre-ticked (the cycle date moved — a re-issue).
  const openSplit = splitOpenInvoices(
    adAccount?.openInvoices ?? [],
    cycleAnchor || adAccount?.nextRebillAt || null
  );
  const [replaceIds, setReplaceIds] = useState<string[]>(openSplit.sameMonthIds);
  const sameMonthKey = openSplit.sameMonthIds.join(",");
  // Re-seeded whenever the chosen cycle (or the open list) changes.
  useEffect(() => {
    setReplaceIds(sameMonthKey ? sameMonthKey.split(",") : []);
  }, [sameMonthKey]);

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
      for (const id of replaceIds)
        if (openSplit.others.some((i) => i.id === id)) fd.append("replaceInvoiceId", id);
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
      // The filed PDF also shows in the client's Documents tab.
      queryClient.invalidateQueries({ queryKey: ["client-documents"] });
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
    <div className="space-y-3">
      {error && <div className={cn(NOTICE, badgeTone.danger)}>{error}</div>}
      {notice && !error && (
        <div className={cn(NOTICE, notice.type === "success" ? badgeTone.success : badgeTone.danger)}>
          {notice.text}
        </div>
      )}
      {sent && (
        <div className={cn(NOTICE, "flex items-center gap-1.5", savedOk ? badgeTone.success : badgeTone.warning)}>
          <Check className="size-4 shrink-0" />
          {savedOk ? "Invoice sent and filed." : "Invoice emailed, but filing the copy failed."}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && !sent && (
          <span className="mr-auto text-xs font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>
        )}
        {adAccount && (
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
        )}
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
        title={draft ? "Review ad account invoice draft" : "Ad account invoice"}
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

            {/* Invoice components — retainer + ad-spend fee. A line appears on
                the invoice only when its amount is greater than zero. */}
            <Section title="Invoice components">
              {/* Account context (free invoices type these in; attached accounts
                  show them read-only since they come from the account). */}
              {isFree && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="adinv-account">Account name</Label>
                    <Input
                      id="adinv-account"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="OT_AC_brand-CC"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="adinv-vendor">Vendor</Label>
                    <Input
                      id="adinv-vendor"
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      placeholder="ConceptSF"
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
                <div className="grid gap-2">
                  <Label htmlFor="adinv-retainer">Monthly retainer ($)</Label>
                  <Input
                    id="adinv-retainer"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={retainerDollars}
                    onChange={(e) => setRetainerDollars(e.target.value.startsWith("-") ? "" : e.target.value)}
                    placeholder="1500"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adinv-spend">Ad spend ($)</Label>
                  <Input
                    id="adinv-spend"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={spendDollars}
                    onChange={(e) => setSpendDollars(e.target.value.startsWith("-") ? "" : e.target.value)}
                    placeholder="41499.35"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adinv-fee">Ad spend fee %</Label>
                  <Select value={String(feeBps)} onValueChange={(v) => setFeeBps(Number(v))}>
                    <SelectTrigger id="adinv-fee">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* An off-grid stored fee still shows correctly. */}
                      {!FEE_OPTIONS.some((o) => o.bps === feeBps) && (
                        <SelectItem value={String(feeBps)}>{(feeBps / 100).toFixed(2)}%</SelectItem>
                      )}
                      {FEE_OPTIONS.map((o) => (
                        <SelectItem key={o.bps} value={String(o.bps)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave retainer or ad spend at 0 to omit that line. These lines are calculated — edit them here, not in the line items below.
              </p>
            </Section>

            <Section title="Recipient">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="adinv-billto">Bill to</Label>
                  <Input
                    id="adinv-billto"
                    value={data.receiver.name}
                    onChange={(e) => patchReceiver({ name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adinv-email">Recipient email</Label>
                  <Input
                    id="adinv-email"
                    aria-invalid={data.receiver.email.trim() && !isValidEmail(data.receiver.email) ? true : undefined}
                    type="email"
                    value={data.receiver.email}
                    onChange={(e) => patchReceiver({ email: e.target.value })}
                    placeholder="client@company.com"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adinv-cc">
                  CC <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <CcChipsInput field={cc} id="adinv-cc" exclude={[data.receiver.email]} />
              </div>
              <AttachmentPicker state={attach} />
            </Section>

            <Section title="Details">
              {/* Billing cycle (attached accounts only) */}
              {adAccount && (
                <div className="grid gap-2">
                  <Label htmlFor="adinv-cycle">Billing cycle</Label>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Select
                      value={
                        (cycleAnchor === "" ||
                        cycleChoices.some((c) => c.offset !== 0 && c.date === cycleAnchor)
                          ? cycleAnchor
                          : "custom") || NEXT_CYCLE
                      }
                      onValueChange={(raw) => {
                        const v = raw === NEXT_CYCLE ? "" : raw;
                        setDirty(true);
                        if (v === "custom") setCycleAnchor(adAccount.nextRebillAt ?? todayYmd());
                        else setCycleAnchor(v);
                      }}
                    >
                      <SelectTrigger id="adinv-cycle">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NEXT_CYCLE}>
                          Next cycle{adAccount.nextRebillAt ? ` (${formatDate(adAccount.nextRebillAt)})` : ""} — default
                        </SelectItem>
                        {cycleChoices
                          .filter((c) => c.offset !== 0)
                          .map((c) => (
                            <SelectItem key={c.date} value={c.date}>
                              {formatDate(c.date)} ({c.offset < 0 ? "previous" : "future"})
                            </SelectItem>
                          ))}
                        <SelectItem value="custom">Custom date…</SelectItem>
                      </SelectContent>
                    </Select>
                    {cycleAnchor !== "" && (
                      <DatePicker
                        aria-label="Custom billing cycle date"
                        value={cycleAnchor}
                        onValueChange={(v) => {
                          setDirty(true);
                          setCycleAnchor(v);
                        }}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Which monthly cycle this invoice covers. It replaces only an awaiting invoice
                    for the SAME cycle (a re-send); the default cycle lights &ldquo;Invoice
                    sent&rdquo;. Any other cycle is recorded alongside — for a delayed or upcoming
                    month.
                  </p>
                  {(openSplit.replaced.length > 0 || openSplit.others.length > 0) && (
                    <div className="space-y-2 rounded-2xl bg-muted/50 p-3 text-xs">
                      {openSplit.replaced.map((i) => (
                        <p key={i.id} className="text-amber-700 dark:text-amber-400">
                          Replaces <span className="font-medium">{i.invoiceNumber}</span> (sent{" "}
                          {formatDate(i.sentAt)} for this cycle) — it stays in history as
                          Superseded. To chase payment instead, use Follow up in the account&rsquo;s
                          Invoices.
                        </p>
                      ))}
                      {openSplit.others.length > 0 && (
                        <>
                          <p className="text-muted-foreground">
                            Also awaiting payment — kept as-is unless this invoice re-issues one
                            {openSplit.sameMonthIds.length > 0 &&
                              " (same-month invoices are pre-selected)"}
                            :
                          </p>
                          {openSplit.others.map((i) => (
                            <label key={i.id} className="flex items-start gap-2 text-foreground">
                              <Checkbox
                                className="mt-px"
                                checked={replaceIds.includes(i.id)}
                                disabled={sent || busy !== null}
                                onCheckedChange={(v) =>
                                  setReplaceIds((ids) =>
                                    v === true ? [...ids, i.id] : ids.filter((x) => x !== i.id)
                                  )
                                }
                              />
                              <span>
                                Replace <span className="font-medium">{i.invoiceNumber}</span>{" "}
                                <span className="text-muted-foreground">
                                  (cycle {formatDate(i.cycleAnchor)}, sent {formatDate(i.sentAt)})
                                </span>
                              </span>
                            </label>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Invoice style — default AC or a saved agency profile (e.g. PepAds) */}
              <InvoiceStyleSelect
                selectedId={styleProfile?.id ?? null}
                onSelect={applyStyle}
                paymentType={paymentType}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
                <div className="grid gap-2">
                  <Label htmlFor="adinv-date">Invoice date</Label>
                  <DatePicker
                    id="adinv-date"
                    value={data.details.invoiceDate}
                    onValueChange={(v) => patchDetails({ invoiceDate: v })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="adinv-due">Due date</Label>
                  <DatePicker
                    id="adinv-due"
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
