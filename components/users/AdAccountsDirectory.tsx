"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import {
  Plus,
  Send,
  Pencil,
  Trash2,
  Megaphone,
  DollarSign,
  CheckCircle2,
  RefreshCcw,
  FileText,
  ReceiptText,
  HelpCircle,
  CreditCard,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RebillStatusChip } from "./RebillStatusChip";
import { AdAccountFormModal } from "./AdAccountFormModal";
import type { AdAccountInvoiceTarget } from "./AdAccountInvoiceDrawer";
// Lazy-loaded: pulls in @react-pdf/renderer only when the admin opens the
// invoice drawer, keeping the Ad Accounts tab's initial bundle light.
const AdAccountInvoiceDrawer = dynamic(
  () => import("./AdAccountInvoiceDrawer").then((m) => m.AdAccountInvoiceDrawer),
  { ssr: false }
);
import {
  AdAccountSentInvoicesPanel,
  useAdAccountSentInvoices,
} from "./AdAccountSentInvoicesPanel";
import { AdAccountInvoicesDrawer } from "./AdAccountInvoicesDrawer";
import { AdAccountsGuide } from "./AdAccountsGuide";
import { AdAccountPaymentSettingsModal } from "./AdAccountPaymentSettingsModal";
import { formatMoney, formatDate } from "./format";
import type { AdAccountDirectoryRow, AdAccountSummary } from "@/lib/adAccountDirectory";

const PAGE_SIZE = 20;

interface DirectoryResponse {
  rows: AdAccountDirectoryRow[];
  summary: AdAccountSummary;
}

async function fetchAdAccounts(): Promise<DirectoryResponse> {
  const res = await fetch("/api/admin/ad-accounts");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as DirectoryResponse;
}

function feeLabel(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

function toInvoiceTarget(row: AdAccountDirectoryRow): AdAccountInvoiceTarget {
  return {
    id: row.id,
    accountName: row.accountName,
    vendor: row.vendor,
    adSpendFeeBps: row.adSpendFeeBps,
    monthlyRetainerCents: row.monthlyRetainerCents,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
  };
}

export function AdAccountsDirectory() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AdAccountDirectoryRow | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<
    AdAccountInvoiceTarget | null | undefined
  >(undefined); // undefined = closed, null = free invoice, target = attached
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [sentOpen, setSentOpen] = useState(false);
  const [invoicesRow, setInvoicesRow] = useState<AdAccountDirectoryRow | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [paymentSettingsOpen, setPaymentSettingsOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-ad-accounts"],
    queryFn: fetchAdAccounts,
    staleTime: 30_000,
  });
  // Sent invoices awaiting payment — feeds the card count + the panel.
  const { data: sentData } = useAdAccountSentInvoices();
  const sentCount = sentData?.count ?? 0;

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  // Active accounts whose monthly bill is due or overdue — drives the alerts
  // panel (built from the rows we already have, no extra request). Overdue
  // first, then by soonest next-bill date.
  const alertRows = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            r.status === "active" &&
            (r.schedule.status === "due" || r.schedule.status === "overdue")
        )
        .sort((a, b) => {
          if (a.schedule.status !== b.schedule.status)
            return a.schedule.status === "overdue" ? -1 : 1;
          return (a.schedule.nextRebillAt ?? "").localeCompare(b.schedule.nextRebillAt ?? "");
        }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.accountName} ${r.vendor ?? ""} ${r.clientName ?? ""} ${r.platform ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-ad-account-sent-invoices"] });
  }

  async function handleDelete(row: AdAccountDirectoryRow) {
    if (!confirm(`Remove ad account "${row.accountName}"? This cannot be undone.`))
      return;
    try {
      const res = await fetch(`/api/admin/ad-accounts/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to remove.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard
          icon={Megaphone}
          label="Ad Accounts"
          value={String(summary?.total ?? 0)}
          loading={isLoading}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Active"
          value={String(summary?.active ?? 0)}
          color="text-emerald-600 dark:text-emerald-400"
          loading={isLoading}
        />
        <SummaryCard
          icon={DollarSign}
          label="Total Value"
          value={formatMoney(summary?.totalValueCents ?? 0)}
          sub="All ad accounts"
          loading={isLoading}
        />
        <SummaryCard
          icon={RefreshCcw}
          label="Bills Due"
          value={String(summary?.billsDue ?? 0)}
          color={
            (summary?.billsDue ?? 0) > 0
              ? "text-amber-600 dark:text-amber-400"
              : undefined
          }
          sub={summary?.overdue ? `${summary.overdue} overdue` : "none overdue"}
          loading={isLoading}
          onClick={() => setAlertsOpen((o) => !o)}
        />
        <SummaryCard
          icon={FileText}
          label="Invoices Sent"
          value={String(sentCount)}
          color={sentCount > 0 ? "text-violet-600 dark:text-violet-400" : undefined}
          sub="awaiting payment"
          loading={isLoading}
          onClick={() => setSentOpen((o) => !o)}
        />
      </div>

      {/* Re-bill alerts panel — ad accounts whose monthly bill is due/overdue */}
      {alertsOpen && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/20">
            <p className="text-sm font-bold text-foreground">
              Ad accounts to re-bill
              <span className="ml-2 text-xs font-medium text-muted-foreground">
                {alertRows.length} due/overdue
              </span>
            </p>
            <button
              onClick={() => setAlertsOpen(false)}
              className="p-1 rounded-lg hover:bg-amber-500/10 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          {alertRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No ad accounts are due for re-billing. 🎉
            </p>
          ) : (
            <ul className="divide-y divide-amber-500/10">
              {alertRows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {row.accountName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.clientName ?? "Unattached"}
                      {row.schedule.nextRebillAt
                        ? ` · due ${formatDate(row.schedule.nextRebillAt)}`
                        : ""}
                      {` · ${formatMoney(row.monthlyRetainerCents)}/mo`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <RebillStatusChip status={row.schedule.status} paid={row.schedule.paid} />
                    <button
                      onClick={() => setInvoiceTarget(toInvoiceTarget(row))}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send invoice
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Sent invoices panel — stored ad-account invoices awaiting payment */}
      {sentOpen && <AdAccountSentInvoicesPanel onClose={() => setSentOpen(false)} />}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search account, vendor, client…"
          className="w-full sm:flex-1 sm:max-w-sm rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setGuideOpen(true)}
            className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="How Ad Accounts billing works"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="whitespace-nowrap">Guide</span>
          </button>
          <button
            onClick={() => setPaymentSettingsOpen(true)}
            className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Edit the bank details on ad-account invoices"
          >
            <CreditCard className="h-4 w-4" />
            <span className="whitespace-nowrap">Payment settings</span>
          </button>
          <button
            onClick={() => setInvoiceTarget(null)}
            className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted/50 transition-colors"
          >
            <Send className="h-4 w-4" />
            <span className="whitespace-nowrap">Send ad invoice</span>
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 ac-gradient hover:opacity-90 active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span className="whitespace-nowrap">Add Ad Account</span>
          </button>
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Failed to load ad accounts. Refresh the page to try again.
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/30 dark:bg-white/[0.03] border-b border-border/50">
                <Th className="pl-4">Account</Th>
                <Th>Client</Th>
                <Th className="text-right">Ad Spend Fee</Th>
                <Th className="text-right">Monthly Retainer</Th>
                <Th>Status</Th>
                <Th>Next Bill</Th>
                <Th className="text-right pr-4">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [1, 2, 3, 4].map((i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-8 w-full animate-pulse rounded-lg bg-muted/60" />
                    </td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No ad accounts yet. Click “Add Ad Account” to create one.
                  </td>
                </tr>
              ) : (
                paginated.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/50 dark:border-white/[0.06] hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-foreground truncate">
                        {row.accountName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[row.vendor, row.platform].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {row.clientName ? (
                        <span className="text-sm text-foreground">{row.clientName}</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold uppercase">
                          Unattached
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-foreground">
                        {feeLabel(row.adSpendFeeBps)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(row.monthlyRetainerCents)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold",
                          row.status === "active"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-slate-500/10 text-slate-600 dark:text-slate-400"
                        )}
                      >
                        {row.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <RebillStatusChip status={row.schedule.status} paid={row.schedule.paid} />
                        {row.schedule.nextRebillAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(row.schedule.nextRebillAt)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          title="Invoices"
                          onClick={() => setInvoicesRow(row)}
                        >
                          <ReceiptText className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          title="Send invoice"
                          onClick={() => setInvoiceTarget(toInvoiceTarget(row))}
                        >
                          <Send className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn title="Edit" onClick={() => setEditing(row)}>
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          title="Remove"
                          danger
                          onClick={() => handleDelete(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden p-3 space-y-3">
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-24 w-full animate-pulse rounded-xl bg-muted/60" />
            ))
          ) : paginated.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No ad accounts yet.
            </p>
          ) : (
            paginated.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-border/50 dark:border-white/[0.06] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {row.accountName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[row.vendor, row.platform].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0",
                      row.status === "active"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-slate-500/10 text-slate-600 dark:text-slate-400"
                    )}
                  >
                    {row.status === "active" ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Field label="Client">
                    {row.clientName ? (
                      <span className="text-foreground">{row.clientName}</span>
                    ) : (
                      <span className="text-muted-foreground">Unattached</span>
                    )}
                  </Field>
                  <Field label="Ad spend fee">
                    <span className="font-semibold text-foreground">
                      {feeLabel(row.adSpendFeeBps)}
                    </span>
                  </Field>
                  <Field label="Monthly retainer">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(row.monthlyRetainerCents)}
                    </span>
                  </Field>
                  <Field label="Next bill">
                    <span className="flex items-center gap-1.5">
                      <RebillStatusChip status={row.schedule.status} paid={row.schedule.paid} />
                    </span>
                  </Field>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-2">
                  <IconBtn title="Invoices" onClick={() => setInvoicesRow(row)}>
                    <ReceiptText className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn
                    title="Send invoice"
                    onClick={() => setInvoiceTarget(toInvoiceTarget(row))}
                  >
                    <Send className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn title="Edit" onClick={() => setEditing(row)}>
                    <Pencil className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn title="Remove" danger onClick={() => handleDelete(row)}>
                    <Trash2 className="h-4 w-4" />
                  </IconBtn>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground">
              Showing {paginated.length} of {filtered.length}
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 text-sm hover:bg-muted/50 disabled:opacity-30 transition-colors"
              >
                &lsaquo;
              </button>
              <span className="px-2 flex items-center text-sm font-semibold text-foreground">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 text-sm hover:bg-muted/50 disabled:opacity-30 transition-colors"
              >
                &rsaquo;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals + drawer */}
      {showAdd && (
        <AdAccountFormModal onClose={() => setShowAdd(false)} onSaved={refresh} />
      )}
      {editing && (
        <AdAccountFormModal
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {invoiceTarget !== undefined && (
        <AdAccountInvoiceDrawer
          adAccount={invoiceTarget}
          onClose={() => setInvoiceTarget(undefined)}
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
      {paymentSettingsOpen && (
        <AdAccountPaymentSettingsModal onClose={() => setPaymentSettingsOpen(false)} />
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider",
        className
      )}
    >
      {children}
    </th>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground uppercase">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        // 40px touch target on phones, dense on desktop where a pointer is precise.
        "p-2.5 md:p-1.5 rounded-md text-muted-foreground transition-colors",
        danger
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  loading,
  onClick,
}: {
  icon: typeof Megaphone;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  loading?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4 text-left transition-all",
        onClick && "hover:border-primary/30 hover:shadow-sm cursor-pointer"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      {loading ? (
        <div className="h-8 w-20 rounded bg-muted/50 animate-pulse mt-1" />
      ) : (
        <>
          <p className={cn("text-2xl font-bold mt-1", color ?? "text-foreground")}>
            {value}
          </p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </>
      )}
    </Comp>
  );
}
