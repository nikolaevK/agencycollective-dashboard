"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Send, ExternalLink, Loader2, FileSignature, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDealContract } from "@/hooks/useDealContract";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dialogOverlayClass } from "@/components/ui/dialog";
import { sheetPanelClass } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/use-confirm";
import { cn } from "@/lib/utils";

interface Props {
  dealId: string | null;
  clientEmail?: string | null;
  onClose: () => void;
  isAdmin?: boolean;
}

// `dot` = the status badge's dot color.
const STATUS_INFO: Record<string, { label: string; tone: BadgeTone; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pending", tone: "warning", icon: FileSignature },
  sent: { label: "Sent — Awaiting Signature", tone: "info", icon: FileSignature },
  viewed: { label: "Viewed by Client", tone: "info", icon: FileSignature },
  signed: { label: "Signed", tone: "success", icon: CheckCircle2 },
  expired: { label: "Expired", tone: "danger", icon: AlertCircle },
  declined: { label: "Declined", tone: "danger", icon: AlertCircle },
};

export function DealContractDrawer({ dealId, clientEmail, onClose, isAdmin }: Props) {
  const { data: contract, isLoading } = useDealContract(dealId);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  // Blocked mid-send (Escape, backdrop and ×) so closing can't drop the
  // result of an email in flight.
  function requestClose() {
    if (!resending) onClose();
  }
  // Stays registered while sending (requestClose no-ops) so Escape is absorbed
  // here instead of falling through to whatever layer sits underneath.
  useEscapeKey(requestClose);

  async function handleResend() {
    if (!dealId || !clientEmail) return;
    // This emails the client immediately — confirm the recipient first.
    const verb = contract ? "Resend" : "Send";
    if (
      !(await confirm({
        title: `${verb} the contract to ${clientEmail}?`,
        description: "They'll get a new signing email right away.",
        confirmText: verb,
      }))
    )
      return;
    setResending(true);
    setResendError(null);
    setResendSuccess(null);
    try {
      const res = await fetch("/api/admin/deal-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, email: clientEmail }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setResendError(json.error || "Failed to send contract");
        return;
      }
      setResendSuccess(`Contract sent to ${clientEmail}`);
      queryClient.invalidateQueries({ queryKey: ["deal-contract", dealId] });
      queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
      queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
      // Sending moves a closed deal to pending_signature — refresh the queue.
      queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deal-queue-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-deals"] });
      queryClient.invalidateQueries({ queryKey: ["closer-detail"] });
    } catch {
      setResendError("Network error");
    } finally {
      setResending(false);
    }
  }

  async function handleSync() {
    if (!dealId) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/admin/deal-contracts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSyncMessage(json.error || "Sync failed");
        return;
      }
      if (json.data?.changed) {
        setSyncMessage(`Status updated: ${json.data.previousStatus} → ${json.data.currentStatus}`);
        queryClient.invalidateQueries({ queryKey: ["deal-contract", dealId] });
        queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
        queryClient.invalidateQueries({ queryKey: ["admin-all-deals"] });
        queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
      } else {
        setSyncMessage("Already up to date");
      }
    } catch {
      setSyncMessage("Network error");
    } finally {
      setSyncing(false);
    }
  }

  const statusInfo = contract ? STATUS_INFO[contract.status] ?? STATUS_INFO.pending : null;
  const StatusIcon = statusInfo?.icon ?? FileSignature;

  // Rendered into <body> (like the invoice drawer) so the confirm dialog
  // stacks above it and it stacks above the app chrome.
  const drawer = (
    <>
      <div className={dialogOverlayClass} onClick={requestClose} />
      <div
        className={cn(
          sheetPanelClass,
          "fixed inset-y-0 right-0 z-50 h-full w-full max-w-md overflow-y-auto overscroll-contain border-l"
        )}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-popover px-4 py-4 sm:px-6">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <FileSignature className="size-4 text-muted-foreground" />
            Contract
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={requestClose}
            disabled={resending}
            aria-label="Close"
            className="-mr-2 text-muted-foreground"
          >
            <X />
          </Button>
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !contract ? (
            <div className="text-center py-12">
              <FileSignature className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No contract for this deal</p>
              {isAdmin && (
                <>
                  <Button
                    onClick={handleResend}
                    disabled={resending || !clientEmail}
                    className="mt-4"
                  >
                    {resending ? <Loader2 className="animate-spin" /> : <Send />}
                    Send Contract
                  </Button>
                  <RecipientNote email={clientEmail} className="mt-2" />
                </>
              )}
              {resendError && <p className="mt-2 text-xs text-destructive">{resendError}</p>}
              {resendSuccess && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{resendSuccess}</p>}
            </div>
          ) : (
            <>
              {/* Status */}
              <Card>
                <CardContent className="flex items-start gap-3 p-4 md:p-4">
                  <StatusIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="space-y-1.5">
                    <StatusBadge tone={statusInfo?.tone}>{statusInfo?.label}</StatusBadge>
                    {contract.sentAt && (
                      <p className="text-xs text-muted-foreground">
                        Sent {new Date(contract.sentAt).toLocaleDateString()}
                      </p>
                    )}
                    {contract.signedAt && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Signed {new Date(contract.signedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Details */}
              <div className="space-y-4">
                {contract.clientEmail && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Client Email</p>
                    <p className="text-sm text-foreground break-all">{contract.clientEmail}</p>
                  </div>
                )}

                {contract.signingUrl && contract.status !== "signed" && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Signing Link</p>
                    <a
                      href={contract.signingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                      Open signing page
                    </a>
                  </div>
                )}

                {contract.documentUrls && contract.documentUrls.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Signed Documents</p>
                    <div className="space-y-1">
                      {contract.documentUrls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          <ExternalLink className="size-3.5 text-muted-foreground" />
                          Document {i + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              {isAdmin && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {contract.status !== "signed" && (
                      <Button
                        onClick={handleResend}
                        disabled={resending || !clientEmail}
                      >
                        {resending ? <Loader2 className="animate-spin" /> : <Send />}
                        Resend Contract
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={handleSync}
                      disabled={syncing}
                    >
                      {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Sync Status
                    </Button>
                  </div>
                  {contract.status !== "signed" && <RecipientNote email={clientEmail} />}
                  {resendError && <p className="text-xs text-destructive">{resendError}</p>}
                  {resendSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400">{resendSuccess}</p>}
                  {syncMessage && <p className="text-xs text-muted-foreground">{syncMessage}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {dialog}
    </>
  );

  return typeof document === "undefined" ? drawer : createPortal(drawer, document.body);
}

/** Where Send/Resend will email — the deal's current client email, which can
 *  differ from the address an earlier send went to. */
function RecipientNote({ email, className }: { email?: string | null; className?: string }) {
  return email ? (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Sends to <span className="font-medium text-foreground break-all">{email}</span>
    </p>
  ) : (
    <p className={cn("text-xs text-amber-600 dark:text-amber-400", className)}>
      No client email on this deal — edit the deal to add one.
    </p>
  );
}
