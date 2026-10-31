"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Plus, X } from "lucide-react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/use-confirm";
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
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus />
        New deal
      </Button>

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
  const { confirm, dialog } = useConfirm();

  // Same guard as the Edit Deal modal: confirm before discarding typed
  // fields, and never close mid-create (the result would be lost).
  async function requestClose() {
    if (saving) return;
    if (dirty && !(await confirm({ title: "Discard this deal?", destructive: true, confirmText: "Discard" }))) return;
    onClose();
  }
  useEscapeKey(requestClose);

  // Portaled to <body> (z-50, like the overlay) so the form's Select / date
  // popovers and the discard prompt — all z-50 portals — layer above it.
  return createPortal(
    <>
      <div className={dialogOverlayClass} onClick={requestClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-new-deal-title"
          className={cn(dialogPanelClass, "pointer-events-auto relative w-full max-w-lg mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain")}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b bg-popover">
            <h3 id="admin-new-deal-title" className="text-base font-semibold tracking-tight">
              New deal
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={requestClose}
              disabled={saving}
              aria-label="Close"
              className="-mr-2"
            >
              <X />
            </Button>
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
      {dialog}
    </>,
    document.body
  );
}
