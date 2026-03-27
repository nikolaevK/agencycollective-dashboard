"use client";

import { useState, useEffect } from "react";
import { X, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PayoutRecord } from "@/lib/payouts";

interface AddEditPayoutModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  payout?: PayoutRecord | null;
  defaultMonth: number;
  defaultYear: number;
}

export function AddEditPayoutModal({
  open,
  onClose,
  onSaved,
  payout,
  defaultMonth,
  defaultYear,
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    }
    setError("");
  }, [payout, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) {
      setError("Brand name is required");
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
      };

      if (isEdit && payout) {
        payload.id = payout.id;
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
        payload.payoutMonth = defaultMonth;
        payload.payoutYear = defaultYear;
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
          <input
            type="text"
            value={vertical}
            onChange={(e) => setVertical(e.target.value)}
            className={inputClass}
            placeholder="e.g. Research, TeleMed"
          />
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

      {/* Sales Rep */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Sales Rep
        </label>
        <input
          type="text"
          value={salesRep}
          onChange={(e) => setSalesRep(e.target.value)}
          className={inputClass}
          placeholder="e.g. Milosh, Chris"
        />
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

      {/* Pay Distributed */}
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
      {/* ── Mobile: full-screen form ── */}
      <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
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

      {/* ── Desktop: centered dialog ── */}
      <div className="hidden md:flex fixed inset-0 z-50 items-center justify-center">
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
