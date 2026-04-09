"use client";

import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PayoutRecord, SplitParty } from "@/lib/payouts";

interface AddEditPayoutModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  payout?: PayoutRecord | null;
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

  const [brandName, setBrandName] = useState("");
  const [dateJoined, setDateJoined] = useState("");
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
    } else {
      setBrandName("");
      setDateJoined("");
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
    setAddingRep(false);
    setNewRepName("");
    setAddingVertical(false);
    setNewVerticalName("");
    setAddingReferral(false);
    setNewReferralName("");
  }, [payout, open]);

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
        // Sync payout month/year with dateJoined on edit
        if (dateJoined) {
          const [y, m] = dateJoined.split("-");
          payload.payoutMonth = Number(m);
          payload.payoutYear = Number(y);
        }
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
        // Derive payout month/year from dateJoined when available
        if (dateJoined) {
          const [y, m] = dateJoined.split("-");
          payload.payoutMonth = Number(m);
          payload.payoutYear = Number(y);
        } else {
          payload.payoutMonth = defaultMonth;
          payload.payoutYear = defaultYear;
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

  const inputClass =
    "flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

  const formFields = (
    <>
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Brand Name + Vertical */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Brand Name *
          </label>
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Pure Core Peptide"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Vertical
          </label>
          {addingVertical ? (
            <div className="flex gap-2">
              <input
                ref={newVerticalRef}
                type="text"
                value={newVerticalName}
                onChange={(e) => setNewVerticalName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddVertical(); }
                  if (e.key === "Escape") { setAddingVertical(false); setNewVerticalName(""); }
                }}
                className={inputClass}
                placeholder="New vertical name..."
              />
              <button
                type="button"
                onClick={handleAddVertical}
                disabled={!newVerticalName.trim()}
                className="px-4 h-11 rounded-lg text-sm font-medium text-primary border border-input hover:bg-accent transition-colors disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setAddingVertical(false); setNewVerticalName(""); }}
                className="px-3 h-11 rounded-lg text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <select
              value={vertical}
              onChange={(e) => {
                if (e.target.value === "__add_new__") {
                  setAddingVertical(true);
                } else {
                  setVertical(e.target.value);
                }
              }}
              className={inputClass}
            >
              <option value="">Select vertical...</option>
              {verticalOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              {vertical && !verticalOptions.includes(vertical) && (
                <option value={vertical}>{vertical}</option>
              )}
              <option value="__add_new__">+ Add new vertical...</option>
            </select>
          )}
        </div>
      </div>

      {/* POC + Service */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Point of Contact
          </label>
          <input
            type="text"
            value={pointOfContact}
            onChange={(e) => setPointOfContact(e.target.value)}
            className={inputClass}
            placeholder="Contact name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Service
          </label>
          <input
            type="text"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className={inputClass}
            placeholder="e.g. Buy Or Die, Ads + Creatives"
          />
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Date Joined
          </label>
          <input
            type="date"
            value={dateJoined}
            onChange={(e) => setDateJoined(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            1st Day Ad Spend
          </label>
          <input
            type="date"
            value={firstDayAdSpend}
            onChange={(e) => setFirstDayAdSpend(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Amount Due + Amount Paid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Amount Due ($)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amountDue}
            onChange={(e) => setAmountDue(e.target.value)}
            className={inputClass}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Amount Paid ($)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            className={inputClass}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Sales Rep (select) */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Sales Rep
        </label>
        {addingRep ? (
          <div className="flex gap-2">
            <input
              ref={newRepRef}
              type="text"
              value={newRepName}
              onChange={(e) => setNewRepName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleAddRep(); }
                if (e.key === "Escape") { setAddingRep(false); setNewRepName(""); }
              }}
              className={inputClass}
              placeholder="New rep name..."
            />
            <button
              type="button"
              onClick={handleAddRep}
              disabled={!newRepName.trim()}
              className="px-4 h-11 rounded-lg text-sm font-medium text-primary border border-input hover:bg-accent transition-colors disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setAddingRep(false); setNewRepName(""); }}
              className="px-3 h-11 rounded-lg text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              value={salesRep}
              onChange={(e) => {
                if (e.target.value === "__add_new__") {
                  setAddingRep(true);
                } else {
                  setSalesRep(e.target.value);
                }
              }}
              className={inputClass}
            >
              <option value="">Select sales rep...</option>
              {salesRepOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              <option value="__add_new__">+ Add new rep...</option>
            </select>
          </div>
        )}
      </div>

      {/* Referral + Percentage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Referral
          </label>
          {addingReferral ? (
            <div className="flex gap-2">
              <input
                ref={newReferralRef}
                type="text"
                value={newReferralName}
                onChange={(e) => setNewReferralName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddReferral(); }
                  if (e.key === "Escape") { setAddingReferral(false); setNewReferralName(""); }
                }}
                className={inputClass}
                placeholder="New referral name..."
              />
              <button
                type="button"
                onClick={handleAddReferral}
                disabled={!newReferralName.trim()}
                className="px-4 h-11 rounded-lg text-sm font-medium text-primary border border-input hover:bg-accent transition-colors disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setAddingReferral(false); setNewReferralName(""); }}
                className="px-3 h-11 rounded-lg text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <select
              value={referral}
              onChange={(e) => {
                if (e.target.value === "__add_new__") {
                  setAddingReferral(true);
                } else {
                  setReferral(e.target.value);
                }
              }}
              className={inputClass}
            >
              <option value="">Select referral...</option>
              {referralOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              {referral && !referralOptions.includes(referral) && (
                <option value={referral}>{referral}</option>
              )}
              <option value="__add_new__">+ Add new referral...</option>
            </select>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Referral %
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={referralPct}
            onChange={(e) => setReferralPct(e.target.value)}
            className={inputClass}
            placeholder="e.g. 10"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={isSigned}
            onChange={(e) => setIsSigned(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Signed
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={isPaid}
            onChange={(e) => setIsPaid(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Paid
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={addedToSlack}
            onChange={(e) => setAddedToSlack(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Added to Slack
        </label>
      </div>

      {/* Pay Distributed + Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Pay Distributed
          </label>
          <select
            value={payDistributed}
            onChange={(e) => setPayDistributed(e.target.value)}
            className={inputClass}
          >
            <option value="No">No</option>
            <option value="Yes">Yes</option>
            <option value="Hold Til Full Pay">Hold Til Full Pay</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Distribution Date
          </label>
          <input
            type="date"
            value={payDistributedDate}
            onChange={(e) => setPayDistributedDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Commission Split */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={commissionSplit}
            onChange={(e) => {
              setCommissionSplit(e.target.checked);
              if (e.target.checked && splitDetails.length < 2) {
                const rep1 = salesRepOptions[0] ?? "";
                const rep2 = salesRepOptions[1] ?? "";
                setSplitDetails(distributeEvenly([
                  { name: rep1, pct: 0 },
                  { name: rep2, pct: 0 },
                ]));
              }
            }}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Commission Split
        </label>

        {commissionSplit && (
          <div className="rounded-lg border border-border/50 dark:border-white/[0.06] bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Split Parties
              </p>
              <span
                className={cn(
                  "text-xs font-medium",
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
                <select
                  value={party.name}
                  onChange={(e) => updateSplitParty(idx, "name", e.target.value)}
                  className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                >
                  <option value="">Select party...</option>
                  {salesRepOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                  {party.name && !salesRepOptions.includes(party.name) && (
                    <option value={party.name}>{party.name}</option>
                  )}
                </select>
                <div className="relative w-20">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={party.pct || ""}
                    onChange={(e) => updateSplitParty(idx, "pct", e.target.value)}
                    placeholder="0"
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 pr-7 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
                {splitDetails.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeSplitParty(idx)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addSplitParty}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add Party
            </button>
          </div>
        )}
      </div>

      {/* Payment Notes */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Payment Notes
        </label>
        <textarea
          value={paymentNotes}
          onChange={(e) => setPaymentNotes(e.target.value)}
          rows={3}
          className={cn(inputClass, "h-auto resize-none")}
          placeholder="Wire details, partial payments, etc."
        />
      </div>
    </>
  );

  return (
    <>
      {/* Mobile: full-screen form */}
      <div className="fixed inset-0 z-[60] flex flex-col bg-background md:hidden">
        {/* Mobile header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h3 className="text-lg font-semibold text-foreground">
            {isEdit ? "Edit Payout" : "Add Payout"}
          </h3>
        </div>

        {/* Mobile scrollable content */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-4 py-5 pb-28 space-y-5">
            {formFields}
          </div>

          {/* Mobile fixed bottom bar */}
          <div className="border-t border-border bg-card px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-11 rounded-lg ac-gradient text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Payout"}
            </button>
          </div>
        </form>
      </div>

      {/* Desktop: centered dialog */}
      <div className="hidden md:flex fixed inset-0 z-[60] items-center justify-center">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border/50 dark:border-white/[0.06] bg-card shadow-xl mx-4">
          {/* Desktop header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 dark:border-white/[0.06] bg-card px-6 py-4 rounded-t-2xl">
            <h3 className="text-lg font-semibold text-foreground">
              {isEdit ? "Edit Payout" : "Add Payout"}
            </h3>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Desktop form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {formFields}

            {/* Desktop actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={cn(
                  "px-5 py-2 rounded-lg text-sm font-medium text-white transition-all",
                  "ac-gradient shadow-lg shadow-primary/20",
                  saving && "opacity-60 cursor-not-allowed"
                )}
              >
                {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Payout"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
