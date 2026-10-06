"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { UnifiedDealForm, type AdminCreatedDeal } from "@/components/shared/UnifiedDealForm";
import { ApprovedNotice } from "@/components/closers/DealDraftsPanel";

// Pulls in @react-pdf — mount only once a deal was created.
const DealInvoiceDrawer = dynamic(
  () => import("@/components/closers/DealInvoiceDrawer").then((m) => m.DealInvoiceDrawer),
  { ssr: false }
);

/**
 * Deal queue "New deal": an admin enters a deal directly — no closer login —
 * credited to the House closer (default) or a picked closer. On create it goes
 * straight on to the new deal's draft invoice for review + send, exactly like
 * an approved agent draft. Nothing is emailed until the admin sends.
 */
export function AdminNewDeal() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<AdminCreatedDeal | null>(null);
  const [notice, setNotice] = useState<AdminCreatedDeal | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white ac-gradient shadow-lg shadow-primary/20"
      >
        <Plus className="h-4 w-4" />
        New deal
      </button>

      {open && (
        <NewDealModal
          onClose={() => setOpen(false)}
          onCreated={(result) => {
            setOpen(false);
            if (result.invoiceId) setCreated(result);
            if (!result.invoiceId || result.warnings.length > 0) setNotice(result);
          }}
        />
      )}

      {created && (
        <DealInvoiceDrawer
          dealId={created.deal.id}
          dealValue={created.deal.dealValue}
          dealPaymentType={created.deal.paymentType}
          dealNotes={created.deal.notes}
          onClose={() => setCreated(null)}
        />
      )}
      {notice && <ApprovedNotice result={notice} onClose={() => setNotice(null)} />}
    </>
  );
}

function NewDealModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: AdminCreatedDeal) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Same guard as the Edit Deal modal: confirm before discarding typed
  // fields, and never close mid-create (the result would be lost).
  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("Discard this deal?")) return;
    onClose();
  }
  useEscapeKey(requestClose);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={requestClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-new-deal-title"
        className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-card rounded-t-2xl">
          <h3 id="admin-new-deal-title" className="text-lg font-semibold text-foreground">
            New deal
          </h3>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            aria-label="Close"
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <span aria-hidden>&times;</span>
          </button>
        </div>
        <div className="p-4 sm:p-6">
          <UnifiedDealForm
            mode="create"
            context="admin"
            onCreated={onCreated}
            onCancel={requestClose}
            onDirtyChange={setDirty}
            onPendingChange={setSaving}
          />
        </div>
      </div>
    </div>
  );
}
