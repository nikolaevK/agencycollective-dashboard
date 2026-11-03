"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Loader2,
  FileText,
  Plus,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCentsExact } from "@/lib/format";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Badge, StatusBadge, badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { dialogOverlayClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sheetPanelClass } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/use-confirm";
import { formatDate } from "./format";
import type { AdInvoiceType } from "@/lib/adAccountLineItem";
import { useAdmin } from "@/components/providers/AdminProvider";
import {
  InvoiceOverridePanel,
  InvoiceProvenance,
  type OverridableInvoice,
} from "./InvoiceOverridePanel";
import {
  InvoiceFollowUpDialog,
  FollowUpButton,
  FollowUpSummaryText,
} from "./InvoiceFollowUpDialog";
import { canFollowUp, type FollowUpSummary } from "@/lib/invoiceFollowUpRules";

const NOTICE = "rounded-2xl border px-4 py-3 text-sm";
// Same check the register route applies — fail fast instead of a 400.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InvoiceStatus = "sent" | "paid" | "unpaid" | "superseded";

interface AccountInvoice extends OverridableInvoice {
  invoiceType: AdInvoiceType;
  amountCents: number;
  recipientEmail: string | null;
  payoutDocumentId: string | null;
  sentAt: string;
  status: InvoiceStatus;
  ccEmails: string[];
  styleProfileId: string | null;
  followUps?: FollowUpSummary;
}

const STATUS_STYLES: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  sent: { label: "Awaiting", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  unpaid: { label: "Unpaid", tone: "danger" },
  superseded: { label: "Superseded", tone: "neutral" },
};
const UNKNOWN_STATUS_TONE: BadgeTone = "neutral";

function typeLabel(t: AdInvoiceType): string {
  return t === "combined" ? "Retainer + ad spend" : t === "ad_spend" ? "Ad spend fee" : "Retainer";
}

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

async function fetchInvoices(accountId: string): Promise<AccountInvoice[]> {
  const res = await fetch(`/api/admin/ad-accounts/${accountId}/invoices`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data.invoices as AccountInvoice[];
}

interface Props {
  accountId: string;
  accountName: string;
  defaultCycleAnchor: string | null;
  /** The account's schedule `paid` flag (hint when Mark unpaid is contradicted by a payout). */
  schedulePaid?: boolean;
  defaultRecipientEmail: string | null;
  defaultRetainerCents: number;
  onClose: () => void;
  onChanged: () => void;
}

export function AdAccountInvoicesDrawer({
  accountId,
  accountName,
  defaultCycleAnchor,
  schedulePaid,
  defaultRecipientEmail,
  defaultRetainerCents,
  onClose,
  onChanged,
}: Props) {
  const queryClient = useQueryClient();
  const { data: invoices = [], isLoading, isError } = useQuery({
    queryKey: ["admin-ad-account-invoices", accountId],
    queryFn: () => fetchInvoices(accountId),
    staleTime: 30_000,
  });

  const [showRegister, setShowRegister] = useState(false);
  // Whether the open register form holds input — collapsing it or closing
  // the drawer would otherwise silently throw that input away.
  const [registerDirty, setRegisterDirty] = useState(false);
  // Payout linking reads the ledger — hidden for external (partner) scopes.
  const { isExternal } = useAdmin();
  const [followUpInv, setFollowUpInv] = useState<AccountInvoice | null>(null);
  const { confirm, dialog } = useConfirm();

  async function confirmDiscardRegister(): Promise<boolean> {
    return (
      !showRegister ||
      !registerDirty ||
      (await confirm({
        title: "Discard the backdated invoice you started entering?",
        confirmText: "Discard",
        destructive: true,
      }))
    );
  }
  function hideRegister() {
    setShowRegister(false);
    setRegisterDirty(false);
  }
  async function requestClose() {
    if (await confirmDiscardRegister()) onClose();
  }
  // The confirm dialog (Radix) handles its own Escape and marks it handled,
  // so it never reaches this layer.
  useEscapeKey(() => {
    void requestClose();
  });

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ["admin-ad-account-invoices", accountId] });
    queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-ad-account-sent-invoices"] });
    onChanged();
  }

  return (
    <div className={cn(dialogOverlayClass, "z-[60] flex justify-end")} onClick={requestClose}>
      <div
        className={cn(sheetPanelClass, "relative h-full w-full max-w-xl overflow-y-auto overscroll-contain border-l")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-popover px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground">Invoices</h2>
            <p className="truncate text-sm text-muted-foreground">{accountName}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={requestClose}
            aria-label="Close"
            className="-mr-2 text-muted-foreground"
          >
            <X />
          </Button>
        </div>

        <div className="space-y-4 p-5">
          {defaultCycleAnchor && (
            <p className="text-xs text-muted-foreground">
              Current billing cycle:{" "}
              <span className="font-medium text-foreground">{formatDate(defaultCycleAnchor)}</span>
              {" "}— an awaiting invoice anchored to this date shows as &ldquo;Invoice sent&rdquo;.
              Use <span className="font-medium text-foreground">Manage</span> on any invoice to mark it paid/unpaid,
              link a payout, or move it to another cycle.
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              History
              <Badge variant="secondary" className="tabular-nums">
                {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={showRegister}
              onClick={async () => {
                if (!showRegister) setShowRegister(true);
                else if (await confirmDiscardRegister()) hideRegister();
              }}
            >
              <Plus />
              Register backdated
            </Button>
          </div>

          {showRegister && (
            <RegisterForm
              accountId={accountId}
              defaultCycleAnchor={defaultCycleAnchor}
              defaultRecipientEmail={defaultRecipientEmail}
              defaultRetainerCents={defaultRetainerCents}
              onDirtyChange={setRegisterDirty}
              onDone={() => {
                hideRegister();
                refreshAll();
              }}
              onCancel={hideRegister}
            />
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className={cn(NOTICE, badgeTone.danger)}>
              Failed to load invoices.
            </div>
          ) : invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No invoices yet for this ad account.
            </p>
          ) : (
            <ul className="space-y-2">
              {invoices.map((inv) => {
                // Fallback: an unexpected status must not crash the drawer.
                const s = STATUS_STYLES[inv.status] ?? {
                  label: String(inv.status),
                  tone: UNKNOWN_STATUS_TONE,
                };
                return (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 ring-1 ring-foreground/5 dark:ring-foreground/10"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {inv.invoiceNumber}
                        </p>
                        <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {typeLabel(inv.invoiceType)} · sent {formatDate(inv.sentAt)} · cycle{" "}
                        {formatDate(inv.cycleAnchor)}
                        {inv.status === "sent" && defaultCycleAnchor && inv.cycleAnchor === defaultCycleAnchor && (
                          <span className="ml-1 font-medium text-foreground">(current)</span>
                        )}
                      </p>
                      <InvoiceProvenance invoice={inv} />
                      {canFollowUp(inv.status) ? (
                        <FollowUpSummaryText sentAt={inv.sentAt} summary={inv.followUps} />
                      ) : (
                        (inv.followUps?.count ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => setFollowUpInv(inv)}
                            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                          >
                            {inv.followUps!.count} follow-up
                            {inv.followUps!.count !== 1 ? "s" : ""} on record
                          </button>
                        )
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {inv.amountCents > 0 && (
                        <span className="text-sm font-semibold tracking-tight tabular-nums text-foreground">
                          {formatCentsExact(inv.amountCents)}
                        </span>
                      )}
                      {inv.payoutDocumentId && (
                        <Button asChild variant="outline" size="xs">
                          <a
                            href={`/api/admin/ad-accounts/invoices/${inv.id}/document`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View stored PDF"
                          >
                            <FileText />
                            PDF
                          </a>
                        </Button>
                      )}
                      {canFollowUp(inv.status) && (
                        <FollowUpButton onClick={() => setFollowUpInv(inv)} />
                      )}
                    </div>
                    <div className="basis-full">
                      <InvoiceOverridePanel
                        invoice={inv}
                        currentCycle={defaultCycleAnchor}
                        schedulePaid={schedulePaid}
                        patchUrl={`/api/admin/ad-accounts/invoices/${inv.id}`}
                        payoutOptionsUrl={
                          isExternal ? null : `/api/admin/ad-accounts/invoices/${inv.id}/payout-options`
                        }
                        onChanged={refreshAll}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {/* Inside the panel: its stopPropagation keeps clicks in the
            (portaled) confirm from reaching the backdrop's close handler. */}
        {dialog}
      </div>

      {followUpInv && (
        <InvoiceFollowUpDialog
          invoice={followUpInv}
          subjectName={accountName}
          endpoint={`/api/admin/ad-accounts/invoices/${followUpInv.id}/follow-ups`}
          fallbackEmail={defaultRecipientEmail}
          onClose={() => setFollowUpInv(null)}
          onRecorded={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-ad-account-invoices", accountId] });
            queryClient.invalidateQueries({ queryKey: ["admin-ad-account-sent-invoices"] });
          }}
        />
      )}
    </div>
  );
}

function RegisterForm({
  accountId,
  defaultCycleAnchor,
  defaultRecipientEmail,
  defaultRetainerCents,
  onDirtyChange,
  onDone,
  onCancel,
}: {
  accountId: string;
  defaultCycleAnchor: string | null;
  defaultRecipientEmail: string | null;
  defaultRetainerCents: number;
  /** Reports whether the form holds input beyond its defaults. */
  onDirtyChange: (dirty: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  // Defaults captured once — "has input" means anything differs from them.
  const [initial] = useState(() => ({
    cycleAnchor: defaultCycleAnchor ?? todayYmd(),
    sentDate: todayYmd(),
    amountDollars: defaultRetainerCents > 0 ? (defaultRetainerCents / 100).toFixed(2) : "",
    recipientEmail: defaultRecipientEmail ?? "",
  }));
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [cycleAnchor, setCycleAnchor] = useState(initial.cycleAnchor);
  const [sentDate, setSentDate] = useState(initial.sentDate);
  const [amountDollars, setAmountDollars] = useState(initial.amountDollars);
  const [invoiceType, setInvoiceType] = useState<AdInvoiceType>("retainer");
  const [recipientEmail, setRecipientEmail] = useState(initial.recipientEmail);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    invoiceNumber.trim() !== "" ||
    file !== null ||
    invoiceType !== "retainer" ||
    cycleAnchor !== initial.cycleAnchor ||
    sentDate !== initial.sentDate ||
    amountDollars !== initial.amountDollars ||
    recipientEmail !== initial.recipientEmail;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  async function submit() {
    if (!invoiceNumber.trim()) {
      setError("Invoice number is required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleAnchor)) {
      setError("Pick a valid cycle date.");
      return;
    }
    const amount = Number(amountDollars);
    if (amountDollars && (!Number.isFinite(amount) || amount < 0)) {
      setError("Amount must be a non-negative number.");
      return;
    }
    if (sentDate && !/^\d{4}-\d{2}-\d{2}$/.test(sentDate)) {
      setError("Sent date is invalid.");
      return;
    }
    const emailTrim = recipientEmail.trim();
    if (emailTrim && (!EMAIL_RE.test(emailTrim) || emailTrim.length > 254)) {
      setError("Recipient email is not a valid address.");
      return;
    }
    // Same PDF test the route applies (MIME type or .pdf extension).
    if (file && !(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
      setError("Only PDF files can be attached.");
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      setError("PDF too large (max 10 MB).");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("invoiceNumber", invoiceNumber.trim());
      fd.set("cycleAnchor", cycleAnchor);
      if (sentDate) fd.set("sentAt", sentDate);
      fd.set("amountCents", String(amountDollars ? Math.round(amount * 100) : 0));
      fd.set("invoiceType", invoiceType);
      if (emailTrim) fd.set("recipientEmail", emailTrim);
      if (file) fd.set("pdf", file);

      const res = await fetch(`/api/admin/ad-accounts/${accountId}/invoices/register`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register invoice.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <p className="text-sm font-medium text-foreground">
        Register backdated invoice
      </p>
      <div className="grid gap-2">
        <Label htmlFor="adreg-number">Invoice number</Label>
        <Input
          id="adreg-number"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          placeholder="INV-20260301-ABC"
          maxLength={100}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="adreg-sent">Sent date</Label>
          <DatePicker
            id="adreg-sent"
            value={sentDate}
            onValueChange={setSentDate}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="adreg-cycle">Cycle (billing date)</Label>
          <DatePicker
            id="adreg-cycle"
            value={cycleAnchor}
            onValueChange={setCycleAnchor}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="adreg-amount">Amount (USD)</Label>
          <Input
            id="adreg-amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="tabular-nums"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="adreg-type">Type</Label>
          <Select value={invoiceType} onValueChange={(v) => setInvoiceType(v as AdInvoiceType)}>
            <SelectTrigger id="adreg-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="retainer">Retainer</SelectItem>
              <SelectItem value="ad_spend">Ad spend fee</SelectItem>
              <SelectItem value="combined">Retainer + ad spend</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="adreg-email">Recipient email (optional)</Label>
        <Input
          id="adreg-email"
          type="email"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          placeholder="client@company.com"
          maxLength={254}
        />
      </div>
      <div className="grid gap-2">
        <Label>Invoice PDF (optional)</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip />
            {file ? "Change PDF" : "Upload PDF"}
          </Button>
          {file && (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Remove PDF"
                title="Remove PDF"
                className="text-muted-foreground"
                onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
              >
                <X />
              </Button>
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </div>
      </div>

      {error && (
        <div className={cn(NOTICE, badgeTone.danger)}>
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={submit} disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          {submitting ? "Saving…" : "Register"}
        </Button>
      </div>
    </Card>
  );
}
