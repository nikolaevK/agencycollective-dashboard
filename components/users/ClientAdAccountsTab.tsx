"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Pencil, Trash2, Megaphone, ReceiptText, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { RebillStatusChip } from "./RebillStatusChip";
import { AdAccountFormModal } from "./AdAccountFormModal";
import {
  AdAccountInvoiceDrawer,
  type AdAccountInvoiceTarget,
} from "./AdAccountInvoiceDrawer";
import { AdAccountInvoicesDrawer } from "./AdAccountInvoicesDrawer";
import { AdAccountsGuide } from "./AdAccountsGuide";
import { formatMoney, formatDate } from "./format";
import type { AdAccountDirectoryRow, AdAccountSummary } from "@/lib/adAccountDirectory";

async function fetchAdAccounts(): Promise<{
  rows: AdAccountDirectoryRow[];
  summary: AdAccountSummary;
}> {
  const res = await fetch("/api/admin/ad-accounts");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

function feeLabel(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

interface Props {
  userId: string;
  clientName: string;
}

export function ClientAdAccountsTab({ userId, clientName }: Props) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AdAccountDirectoryRow | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<
    AdAccountInvoiceTarget | null
  >(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [invoicesRow, setInvoicesRow] = useState<AdAccountDirectoryRow | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-ad-accounts"],
    queryFn: fetchAdAccounts,
    staleTime: 30_000,
  });

  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => r.userId === userId),
    [data, userId]
  );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
  }

  function openInvoice(row: AdAccountDirectoryRow) {
    setInvoiceTarget({
      id: row.id,
      accountName: row.accountName,
      vendor: row.vendor,
      adSpendFeeBps: row.adSpendFeeBps,
      monthlyRetainerCents: row.monthlyRetainerCents,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
    });
    setDrawerOpen(true);
  }

  async function handleDelete(row: AdAccountDirectoryRow) {
    if (!confirm(`Remove ad account "${row.accountName}"?`)) return;
    try {
      const res = await fetch(`/api/admin/ad-accounts/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to remove.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Ad Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Agency ad accounts this client has purchased — retainer + ad-spend fee.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGuideOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="How Ad Accounts billing works"
          >
            <HelpCircle className="h-4 w-4" />
            Guide
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Failed to load ad accounts. Refresh to try again.
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card p-8 text-center">
          <Megaphone className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No ad accounts yet.{" "}
            <button onClick={() => setShowAdd(true)} className="text-primary hover:underline">
              Add one
            </button>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-foreground truncate">
                    {row.accountName}
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
                      row.status === "active"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-slate-500/10 text-slate-600 dark:text-slate-400"
                    )}
                  >
                    {row.status === "active" ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[row.vendor, row.platform].filter(Boolean).join(" · ") || "—"} ·{" "}
                  {feeLabel(row.adSpendFeeBps)} fee · {formatMoney(row.monthlyRetainerCents)}/mo
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <RebillStatusChip status={row.schedule.status} paid={row.schedule.paid} />
                  {row.schedule.nextRebillAt && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(row.schedule.nextRebillAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    title="Invoices"
                    onClick={() => setInvoicesRow(row)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <ReceiptText className="h-4 w-4" />
                  </button>
                  <button
                    title="Send invoice"
                    onClick={() => openInvoice(row)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                  <button
                    title="Edit"
                    onClick={() => setEditing(row)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    title="Remove"
                    onClick={() => handleDelete(row)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AdAccountFormModal
          presetUserId={userId}
          presetClientName={clientName}
          lockClient
          onClose={() => setShowAdd(false)}
          onSaved={refresh}
        />
      )}
      {editing && (
        <AdAccountFormModal
          account={editing}
          presetUserId={userId}
          presetClientName={clientName}
          lockClient
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {drawerOpen && (
        <AdAccountInvoiceDrawer
          adAccount={invoiceTarget}
          onClose={() => setDrawerOpen(false)}
          onSent={refresh}
        />
      )}
      {invoicesRow && (
        <AdAccountInvoicesDrawer
          accountId={invoicesRow.id}
          accountName={invoicesRow.accountName}
          defaultCycleAnchor={invoicesRow.schedule.nextRebillAt}
          defaultRecipientEmail={invoicesRow.clientEmail}
          defaultRetainerCents={invoicesRow.monthlyRetainerCents}
          onClose={() => setInvoicesRow(null)}
          onChanged={refresh}
        />
      )}
      {guideOpen && <AdAccountsGuide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
