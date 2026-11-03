"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, Plus, Trash2, FileCheck2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PayoutRecord, SplitParty } from "@/lib/payouts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Radix SelectItem can't hold "" — the empty "Select …" option maps to this.
const NONE = "__none__";
// The "+ Add new …" option value (unchanged from the native <select>).
const ADD_NEW = "__add_new__";

const PERIOD_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Pre-fill values + linkage when adding a payout from a signed deal. */
export interface SourceDealPrefill {
  dealId: string;
  brandName: string;
  pointOfContact: string;
  service: string;
  vertical: string;
  dateJoined: string;
  amountDue: string; // dollars, as entered in the form
  amountPaid: string;
  isSigned: boolean;
  isPaid: boolean;
  paymentNotes: string;
  salesRep: string;
}

interface AddEditPayoutModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  payout?: PayoutRecord | null;
  /** When set (and not editing), the form imports from a closed+signed deal:
   *  fields are pre-filled and save attaches the scope + invoice PDFs. */
  sourceDeal?: SourceDealPrefill | null;
  defaultMonth: number;
  defaultYear: number;
  salesRepOptions: string[];
  onSalesRepsChanged: () => void;
  verticalOptions: string[];
  onVerticalsChanged: () => void;
  referralOptions: string[];
  onReferralsChanged: () => void;
}

export function AddEditPayoutModal({
  open,
  onClose,
  onSaved,
  payout,
  sourceDeal,
  defaultMonth,
  defaultYear,
  salesRepOptions,
  onSalesRepsChanged,
  verticalOptions,
  onVerticalsChanged,
  referralOptions,
  onReferralsChanged,
}: AddEditPayoutModalProps) {
  const isEdit = Boolean(payout);
  const isImport = !isEdit && Boolean(sourceDeal);

  const [brandName, setBrandName] = useState("");
  const [dateJoined, setDateJoined] = useState("");
  // Explicit payout period. Previously derived from Date Joined — that made it
  // impossible to record a re-bill for a month other than the join month
  // without fudging the date. New rows default to the month the admin is
  // viewing; deal imports default to the deal's close month; edits keep the
  // stored period. Never silently re-derived.
  const [payoutMonth, setPayoutMonth] = useState(defaultMonth);
  const [payoutYear, setPayoutYear] = useState(String(defaultYear));
  const [firstDayAdSpend, setFirstDayAdSpend] = useState("");
  const [vertical, setVertical] = useState("");
  const [pointOfContact, setPointOfContact] = useState("");
  const [service, setService] = useState("");
  const [isSigned, setIsSigned] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [addedToSlack, setAddedToSlack] = useState(false);
  const [amountDue, setAmountDue] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [salesRep, setSalesRep] = useState("");
  const [payDistributed, setPayDistributed] = useState("No");
  const [payDistributedDate, setPayDistributedDate] = useState("");
  const [commissionSplit, setCommissionSplit] = useState(false);
  const [splitDetails, setSplitDetails] = useState<SplitParty[]>([]);
  const [referral, setReferral] = useState("");
  const [referralPct, setReferralPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Import result: once a deal import succeeds we switch to a confirmation view
  // (the payout already exists, so the form must not be resubmittable).
  const [imported, setImported] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  // Referral "add new" state
  const [addingReferral, setAddingReferral] = useState(false);
  const [newReferralName, setNewReferralName] = useState("");
  const newReferralRef = useRef<HTMLInputElement>(null);

  // Sales rep "add new" state
  const [addingRep, setAddingRep] = useState(false);
  const [newRepName, setNewRepName] = useState("");
  const newRepRef = useRef<HTMLInputElement>(null);

  // Vertical "add new" state
  const [addingVertical, setAddingVertical] = useState(false);
  const [newVerticalName, setNewVerticalName] = useState("");
  const newVerticalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (payout) {
      setBrandName(payout.brandName);
      setDateJoined(payout.dateJoined ?? "");
      setPayoutMonth(payout.payoutMonth);
      setPayoutYear(String(payout.payoutYear));
      setFirstDayAdSpend(payout.firstDayAdSpend ?? "");
      setVertical(payout.vertical ?? "");
      setPointOfContact(payout.pointOfContact ?? "");
      setService(payout.service ?? "");
      setIsSigned(payout.isSigned);
      setIsPaid(payout.isPaid);
      setAddedToSlack(payout.addedToSlack);
      setAmountDue(payout.amountDue ? (payout.amountDue / 100).toString() : "");
      setAmountPaid(payout.amountPaid ? (payout.amountPaid / 100).toString() : "");
      setPaymentNotes(payout.paymentNotes ?? "");
      setSalesRep(payout.salesRep ?? "");
      setPayDistributed(payout.payDistributed);
      setPayDistributedDate(payout.payDistributedDate ?? "");
      setCommissionSplit(payout.commissionSplit);
      setSplitDetails(payout.splitDetails.length > 0 ? payout.splitDetails : []);
      setReferral(payout.referral ?? "");
      setReferralPct(payout.referralPct != null ? String(payout.referralPct) : "");
    } else if (sourceDeal) {
      setBrandName(sourceDeal.brandName);
      setDateJoined(sourceDeal.dateJoined);
      {
        const m = sourceDeal.dateJoined.match(/^(\d{4})-(\d{2})/);
        setPayoutMonth(m ? Number(m[2]) : defaultMonth);
        setPayoutYear(m ? m[1] : String(defaultYear));
      }
      setFirstDayAdSpend("");
      setVertical(sourceDeal.vertical);
      setPointOfContact(sourceDeal.pointOfContact);
      setService(sourceDeal.service);
      setIsSigned(sourceDeal.isSigned);
      setIsPaid(sourceDeal.isPaid);
      setAddedToSlack(false);
      setAmountDue(sourceDeal.amountDue);
      setAmountPaid(sourceDeal.amountPaid);
      setPaymentNotes(sourceDeal.paymentNotes);
      setSalesRep(sourceDeal.salesRep);
      setPayDistributed("No");
      setPayDistributedDate("");
      setCommissionSplit(false);
      setSplitDetails([]);
      setReferral("");
      setReferralPct("");
    } else {
      setBrandName("");
      setDateJoined("");
      setPayoutMonth(defaultMonth);
      setPayoutYear(String(defaultYear));
      setFirstDayAdSpend("");
      setVertical("");
      setPointOfContact("");
      setService("");
      setIsSigned(false);
      setIsPaid(false);
      setAddedToSlack(false);
      setAmountDue("");
      setAmountPaid("");
      setPaymentNotes("");
      setSalesRep("");
      setPayDistributed("No");
      setPayDistributedDate("");
      setCommissionSplit(false);
      setSplitDetails([]);
      setReferral("");
      setReferralPct("");
    }
    setError("");
    setImported(false);
    setImportWarnings([]);
    setAddingRep(false);
    setNewRepName("");
    setAddingVertical(false);
    setNewVerticalName("");
    setAddingReferral(false);
    setNewReferralName("");
  }, [payout, sourceDeal, open, defaultMonth, defaultYear]);

  useEffect(() => {
    if (addingRep && newRepRef.current) newRepRef.current.focus();
  }, [addingRep]);

  useEffect(() => {
    if (addingVertical && newVerticalRef.current) newVerticalRef.current.focus();
  }, [addingVertical]);

  useEffect(() => {
    if (addingReferral && newReferralRef.current) newReferralRef.current.focus();
  }, [addingReferral]);

  if (!open) return null;

  const splitPctTotal = splitDetails.reduce((s, p) => s + p.pct, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) {
      setError("Brand name is required");
      return;
    }
    if (commissionSplit) {
      if (splitDetails.length < 2) {
        setError("Commission split requires at least 2 parties");
        return;
      }
      if (splitDetails.some((p) => !p.name.trim())) {
        setError("All split parties must have a name");
        return;
      }
    }
    const periodYear = Number(payoutYear);
    if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) {
      setError("Payout year must be between 2000 and 2100");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        brandName: brandName.trim(),
        dateJoined: dateJoined || null,
        firstDayAdSpend: firstDayAdSpend || null,
        vertical: vertical || null,
        pointOfContact: pointOfContact || null,
        service: service || null,
        isSigned,
        isPaid,
        addedToSlack,
        amountDue: amountDue ? parseFloat(amountDue) : 0,
        amountPaid: amountPaid ? parseFloat(amountPaid) : 0,
        paymentNotes: paymentNotes || null,
        salesRep: salesRep || null,
        payDistributed,
        payDistributedDate: payDistributedDate || null,
        commissionSplit,
        splitDetails: commissionSplit ? splitDetails.filter((p) => p.name.trim()) : [],
        referral: referral || null,
        referralPct: referralPct ? parseFloat(referralPct) : null,
      };

      if (isEdit && payout) {
        payload.id = payout.id;
        // Explicit payout period (was: silently re-derived from Date Joined).
        payload.payoutMonth = payoutMonth;
        payload.payoutYear = periodYear;
        const res = await fetch("/api/admin/payouts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "Update failed");
        }
      } else {
        payload.payoutMonth = payoutMonth;
        payload.payoutYear = periodYear;

        if (isImport && sourceDeal) {
          // Import path: create the payout AND attach the signed scope + invoice.
          payload.dealId = sourceDeal.dealId;
          const res = await fetch("/api/admin/payouts/from-deal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          // Tolerate a non-JSON error body (proxy 502/504 HTML, empty 500).
          const d = await res.json().catch(() => ({} as { error?: string; warnings?: string[] }));
          if (!res.ok) throw new Error(d.error || "Import failed");
          onSaved();
          const warnings: string[] = Array.isArray(d.warnings) ? d.warnings : [];
          if (warnings.length > 0) {
            // Keep the modal open to surface what couldn't be attached.
            setImportWarnings(warnings);
            setImported(true);
            setSaving(false);
            return;
          }
          onClose();
          return;
        }

        const res = await fetch("/api/admin/payouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "Create failed");
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRep = async () => {
    const trimmed = newRepName.trim();
    if (!trimmed) return;
    const res = await fetch("/api/admin/payouts/sales-reps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      onSalesRepsChanged();
      setSalesRep(trimmed);
    }
    setAddingRep(false);
    setNewRepName("");
  };

  const handleAddVertical = async () => {
    const trimmed = newVerticalName.trim();
    if (!trimmed) return;
    const res = await fetch("/api/admin/payouts/verticals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      onVerticalsChanged();
      setVertical(trimmed);
    }
    setAddingVertical(false);
    setNewVerticalName("");
  };

  const handleAddReferral = async () => {
    const trimmed = newReferralName.trim();
    if (!trimmed) return;
    const res = await fetch("/api/admin/payouts/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      onReferralsChanged();
      setReferral(trimmed);
    }
    setAddingReferral(false);
    setNewReferralName("");
  };

  const distributeEvenly = (parties: SplitParty[]): SplitParty[] => {
    const count = parties.length;
    if (count === 0) return parties;
    const even = Math.floor(100 / count);
    const remainder = 100 - even * count;
    return parties.map((p, i) => ({
      ...p,
      pct: even + (i < remainder ? 1 : 0),
    }));
  };

  const addSplitParty = () => {
    const updated = [...splitDetails, { name: "", pct: 0 }];
    setSplitDetails(distributeEvenly(updated));
  };

  const updateSplitParty = (idx: number, field: "name" | "pct", val: string | number) => {
    const updated = [...splitDetails];
    if (field === "name") updated[idx] = { ...updated[idx], name: String(val) };
    else updated[idx] = { ...updated[idx], pct: Number(val) || 0 };
    setSplitDetails(updated);
  };

  const removeSplitParty = (idx: number) => {
    const updated = splitDetails.filter((_, i) => i !== idx);
    setSplitDetails(distributeEvenly(updated));
  };

  const formFields = (
    <>
      {error && (
        <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isImport && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-muted/50 p-4 text-sm">
          <FileCheck2 className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span>
            Importing from a signed deal — the signed scope &amp; invoice PDF
            will be attached to this brand&apos;s documents on save.
          </span>
        </div>
      )}

      {/* Brand Name + Vertical */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>
            Brand Name *
          </Label>
          <Input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="e.g. Pure Core Peptide"
          />
        </div>
        <div className="grid gap-2">
          <Label>
            Vertical
          </Label>
          {addingVertical ? (
            <div className="flex gap-2">
              <Input
                ref={newVerticalRef}
                type="text"
                value={newVerticalName}
                onChange={(e) => setNewVerticalName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddVertical(); }
                  if (e.key === "Escape") { setAddingVertical(false); setNewVerticalName(""); }
                }}
                className="min-w-0"
                placeholder="New vertical name..."
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddVertical}
                disabled={!newVerticalName.trim()}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setAddingVertical(false); setNewVerticalName(""); }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Select
              value={vertical || NONE}
              onValueChange={(v) => {
                if (v === ADD_NEW) {
                  setAddingVertical(true);
                } else {
                  setVertical(v === NONE ? "" : v);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vertical..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select vertical...</SelectItem>
                {verticalOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
                {vertical && !verticalOptions.includes(vertical) && (
                  <SelectItem value={vertical}>{vertical}</SelectItem>
                )}
                <SelectItem value={ADD_NEW}>+ Add new vertical...</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* POC + Service */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>
            Point of Contact
          </Label>
          <Input
            type="text"
            value={pointOfContact}
            onChange={(e) => setPointOfContact(e.target.value)}
            placeholder="Contact name"
          />
        </div>
        <div className="grid gap-2">
          <Label>
            Service
          </Label>
          <Input
            type="text"
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="e.g. Buy Or Die, Ads + Creatives"
          />
        </div>
      </div>

      {/* Payout period — which month this row is booked under */}
      <div className="grid gap-2">
        <Label>
          Payout Month
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={String(payoutMonth)}
            onValueChange={(v) => setPayoutMonth(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_MONTHS.map((name, i) => (
                <SelectItem key={name} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            value={payoutYear}
            onChange={(e) => setPayoutYear(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          The month this payment is booked under — past or upcoming.
          {isEdit
            ? " Changing it moves the row to that month."
            : isImport
              ? " Defaults to the deal's close month."
              : " Defaults to the month you're viewing on the Payouts page."}
        </p>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>
            Date Joined
          </Label>
          <DatePicker
            value={dateJoined}
            onValueChange={setDateJoined}
            aria-label="Date Joined"
          />
        </div>
        <div className="grid gap-2">
          <Label>
            1st Day Ad Spend
          </Label>
          <DatePicker
            value={firstDayAdSpend}
            onValueChange={setFirstDayAdSpend}
            aria-label="1st Day Ad Spend"
          />
        </div>
      </div>

      {/* Amount Due + Amount Paid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>
            Amount Due ($)
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amountDue}
            onChange={(e) => setAmountDue(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="grid gap-2">
          <Label>
            Amount Paid ($)
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Sales Rep (select) */}
      <div className="grid gap-2">
        <Label>
          Sales Rep
        </Label>
        {addingRep ? (
          <div className="flex gap-2">
            <Input
              ref={newRepRef}
              type="text"
              value={newRepName}
              onChange={(e) => setNewRepName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleAddRep(); }
                if (e.key === "Escape") { setAddingRep(false); setNewRepName(""); }
              }}
              className="min-w-0"
              placeholder="New rep name..."
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleAddRep}
              disabled={!newRepName.trim()}
            >
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setAddingRep(false); setNewRepName(""); }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Select
              value={salesRep || NONE}
              onValueChange={(v) => {
                if (v === ADD_NEW) {
                  setAddingRep(true);
                } else {
                  setSalesRep(v === NONE ? "" : v);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select sales rep..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select sales rep...</SelectItem>
                {salesRepOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
                {salesRep && !salesRepOptions.includes(salesRep) && (
                  <SelectItem value={salesRep}>{salesRep}</SelectItem>
                )}
                <SelectItem value={ADD_NEW}>+ Add new rep...</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Referral + Percentage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>
            Referral
          </Label>
          {addingReferral ? (
            <div className="flex gap-2">
              <Input
                ref={newReferralRef}
                type="text"
                value={newReferralName}
                onChange={(e) => setNewReferralName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddReferral(); }
                  if (e.key === "Escape") { setAddingReferral(false); setNewReferralName(""); }
                }}
                className="min-w-0"
                placeholder="New referral name..."
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddReferral}
                disabled={!newReferralName.trim()}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setAddingReferral(false); setNewReferralName(""); }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Select
              value={referral || NONE}
              onValueChange={(v) => {
                if (v === ADD_NEW) {
                  setAddingReferral(true);
                } else {
                  setReferral(v === NONE ? "" : v);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select referral..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Select referral...</SelectItem>
                {referralOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
                {referral && !referralOptions.includes(referral) && (
                  <SelectItem value={referral}>{referral}</SelectItem>
                )}
                <SelectItem value={ADD_NEW}>+ Add new referral...</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="grid gap-2">
          <Label>
            Referral %
          </Label>
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            step="1"
            value={referralPct}
            onChange={(e) => setReferralPct(e.target.value)}
            placeholder="e.g. 10"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-6">
        <Label className="cursor-pointer font-normal">
          <Checkbox
            checked={isSigned}
            onCheckedChange={(c) => setIsSigned(c === true)}
          />
          Signed
        </Label>
        <Label className="cursor-pointer font-normal">
          <Checkbox
            checked={isPaid}
            onCheckedChange={(c) => setIsPaid(c === true)}
          />
          Paid
        </Label>
        <Label className="cursor-pointer font-normal">
          <Checkbox
            checked={addedToSlack}
            onCheckedChange={(c) => setAddedToSlack(c === true)}
          />
          Added to Slack
        </Label>
      </div>

      {/* Pay Distributed + Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>
            Pay Distributed
          </Label>
          <Select
            value={payDistributed}
            onValueChange={(v) => setPayDistributed(v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="No">No</SelectItem>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="Hold Til Full Pay">Hold Til Full Pay</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>
            Distribution Date
          </Label>
          <DatePicker
            value={payDistributedDate}
            onValueChange={setPayDistributedDate}
            aria-label="Distribution Date"
          />
        </div>
      </div>

      {/* Commission Split */}
      <div className="space-y-3">
        <Label className="cursor-pointer font-normal">
          <Checkbox
            checked={commissionSplit}
            onCheckedChange={(c) => {
              const checked = c === true;
              setCommissionSplit(checked);
              if (checked && splitDetails.length < 2) {
                const rep1 = salesRepOptions[0] ?? "";
                const rep2 = salesRepOptions[1] ?? "";
                setSplitDetails(distributeEvenly([
                  { name: rep1, pct: 0 },
                  { name: rep2, pct: 0 },
                ]));
              }
            }}
          />
          Commission Split
        </Label>

        {commissionSplit && (
          <div className="rounded-2xl bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Split Parties
              </p>
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  splitPctTotal === 100
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                )}
              >
                Total: {splitPctTotal}%
              </span>
            </div>

            {splitDetails.map((party, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <Select
                  value={party.name || NONE}
                  onValueChange={(v) => updateSplitParty(idx, "name", v === NONE ? "" : v)}
                >
                  <SelectTrigger className="flex-1 min-w-0 bg-background">
                    <SelectValue placeholder="Select party..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Select party...</SelectItem>
                    {salesRepOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                    {party.name && !salesRepOptions.includes(party.name) && (
                      <SelectItem value={party.name}>{party.name}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <div className="relative w-20 shrink-0">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    value={party.pct || ""}
                    onChange={(e) => updateSplitParty(idx, "pct", e.target.value)}
                    placeholder="0"
                    className="bg-background pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
                {splitDetails.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSplitParty(idx)}
                    aria-label="Remove party"
                    className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addSplitParty}
            >
              <Plus />
              Add Party
            </Button>
          </div>
        )}
      </div>

      {/* Payment Notes */}
      <div className="grid gap-2">
        <Label>
          Payment Notes
        </Label>
        <Textarea
          value={paymentNotes}
          onChange={(e) => setPaymentNotes(e.target.value)}
          rows={3}
          placeholder="Wire details, partial payments, etc."
        />
      </div>
    </>
  );

  const importedView = (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-2xl bg-muted/50 p-4 text-sm">
        <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-emerald-500" />
        <span>Payout created and imported from the signed deal.</span>
      </div>
      <div className="rounded-2xl bg-muted/50 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
          Some documents need a manual upload
        </div>
        <ul className="mt-2 list-disc pl-8 space-y-1 text-sm text-muted-foreground">
          {importWarnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <p className="mt-2 pl-1 text-xs text-muted-foreground">
          Use the brand&apos;s Documents panel to upload them when ready.
        </p>
      </div>
    </div>
  );

  // Portaled to <body> at z-50 (was in-tree at z-[60]) so the shadcn
  // Select / DatePicker popovers — which portal to <body> at z-50 when
  // opened — stack above it, while it still covers the mobile BottomNav.
  // Open/close mechanics are unchanged.
  return createPortal(
    <>
      {/* Mobile: full-screen form */}
      <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
        {/* Mobile header */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted-foreground"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <h3 className="text-lg font-semibold tracking-tight">
            {isEdit ? "Edit Payout" : isImport ? "Import from Deal" : "Add Payout"}
          </h3>
        </div>

        {/* Mobile scrollable content */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5 pb-28 space-y-4">
            {imported ? importedView : formFields}
          </div>

          {/* Mobile fixed bottom bar */}
          <div className="shrink-0 border-t bg-background px-4 py-3 flex items-center gap-3">
            {imported ? (
              <Button
                type="button"
                size="lg"
                onClick={onClose}
                className="flex-1"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={onClose}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  disabled={saving}
                  className="flex-1"
                >
                  {saving ? "Saving..." : isEdit ? "Save Changes" : isImport ? "Import Payout" : "Add Payout"}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>

      {/* Desktop: centered dialog */}
      <div className="hidden md:flex fixed inset-0 z-50 items-center justify-center">
        <div
          className={dialogOverlayClass}
          onClick={onClose}
        />
        <div
          className={cn(
            dialogPanelClass,
            "relative z-50 w-full max-w-2xl max-h-[90dvh] overflow-y-auto mx-4"
          )}
        >
          {/* Desktop header */}
          <div className="sticky top-0 z-10 flex items-center justify-between bg-popover px-6 pt-6 pb-4">
            <h3 className="text-base font-medium leading-none">
              {isEdit ? "Edit Payout" : isImport ? "Import from Deal" : "Add Payout"}
            </h3>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close"
              className="bg-secondary"
            >
              <X />
            </Button>
          </div>

          {/* Desktop form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-4">
            {imported ? importedView : formFields}

            {/* Desktop actions */}
            <div className="flex justify-end gap-2 pt-2">
              {imported ? (
                <Button
                  type="button"
                  onClick={onClose}
                >
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : isEdit ? "Save Changes" : isImport ? "Import Payout" : "Add Payout"}
                  </Button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
