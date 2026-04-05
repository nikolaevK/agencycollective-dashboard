"use client";

import { useState } from "react";
import { X, Send, ExternalLink, Loader2, FileSignature, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDealContract } from "@/hooks/useDealContract";
import { cn } from "@/lib/utils";

interface Props {
  dealId: string | null;
  clientEmail?: string | null;
  onClose: () => void;
  isAdmin?: boolean;
}

const STATUS_INFO: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pending", color: "text-amber-500", icon: FileSignature },
  sent: { label: "Sent — Awaiting Signature", color: "text-blue-500", icon: FileSignature },
  viewed: { label: "Viewed by Client", color: "text-sky-500", icon: FileSignature },
  signed: { label: "Signed", color: "text-emerald-500", icon: CheckCircle2 },
  expired: { label: "Expired", color: "text-red-500", icon: AlertCircle },
  declined: { label: "Declined", color: "text-red-500", icon: AlertCircle },
};

export function DealContractDrawer({ dealId, clientEmail, onClose, isAdmin }: Props) {
  const { data: contract, isLoading } = useDealContract(dealId);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function handleResend() {
    if (!dealId) return;
    setResending(true);
    setResendError(null);
    try {
      const res = await fetch("/api/admin/deal-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, email: clientEmail }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResendError(json.error || "Failed to resend");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["deal-contract", dealId] });
      queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
      queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l border-border shadow-2xl h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Contract
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !contract ? (
            <div className="text-center py-12">
              <FileSignature className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No contract for this deal</p>
              {isAdmin && (
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Contract
                </button>
              )}
              {resendError && <p className="mt-2 text-xs text-red-500">{resendError}</p>}
            </div>
          ) : (
            <>
              {/* Status */}
              <div className="rounded-xl border border-border/50 p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("h-10 w-10 rounded-full flex items-center justify-center bg-muted", statusInfo?.color)}>
                    <StatusIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={cn("text-sm font-semibold", statusInfo?.color)}>{statusInfo?.label}</p>
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
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3">
                {contract.clientEmail && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Client Email</p>
                    <p className="text-sm text-foreground mt-0.5">{contract.clientEmail}</p>
                  </div>
                )}

                {contract.signingUrl && contract.status !== "signed" && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Signing Link</p>
                    <a
                      href={contract.signingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open signing page
                    </a>
                  </div>
                )}

                {contract.documentUrls && contract.documentUrls.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Signed Documents</p>
                    <div className="space-y-1">
                      {contract.documentUrls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Document {i + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              {isAdmin && (
                <div className="pt-4 border-t border-border/50 space-y-3">
                  <div className="flex items-center gap-2">
                    {contract.status !== "signed" && (
                      <button
                        onClick={handleResend}
                        disabled={resending}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Resend Contract
                      </button>
                    )}
                    <button
                      onClick={handleSync}
                      disabled={syncing}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Sync Status
                    </button>
                  </div>
                  {resendError && <p className="text-xs text-red-500">{resendError}</p>}
                  {syncMessage && <p className="text-xs text-muted-foreground">{syncMessage}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
