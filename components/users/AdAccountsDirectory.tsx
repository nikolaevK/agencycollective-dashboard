"use client";

import { useMemo, useRef, useState } from "react";
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
  MoreHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, StatusBadge, badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/components/ui/use-confirm";
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
import { useAdmin } from "@/components/providers/AdminProvider";
import type { AdAccountDirectoryRow, AdAccountSummary } from "@/lib/adAccountDirectory";
import { toOpenInvoiceRefs } from "./openInvoices";

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
    nextRebillAt: row.schedule.nextRebillAt,
    openInvoices: toOpenInvoiceRefs(row.sentInvoices),
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
  const admin = useAdmin();
  const [paymentSettingsOpen, setPaymentSettingsOpen] = useState(false);
  const { confirm, dialog } = useConfirm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-ad-accounts"],
    queryFn: fetchAdAccounts,
    staleTime: 30_000,
  });
  // Sent invoices awaiting payment — feeds the card count + the panel.
  const { data: sentData } = useAdAccountSentInvoices();
  const sentCount = sentData?.count ?? 0;

  const rows = data?.rows ?? [];
  // The drawer reads the LIVE row: a Mark paid / Set cycle inside it refetches
  // the directory, and the snapshot taken on open would keep showing the old
  // "(current)" cycle and paid hint.
  const liveInvoicesRow = invoicesRow
    ? rows.find((r) => r.id === invoicesRow.id) ?? invoicesRow
    : null;
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
    if (
      !(await confirm({
        title: `Remove ad account "${row.accountName}"?`,
        description: "This cannot be undone.",
        confirmText: "Remove",
        destructive: true,
      }))
    )
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
              ? "text-amber-700 dark:text-amber-400"
              : undefined
          }
          sub={summary?.overdue ? `${summary.overdue} overdue` : "none overdue"}
          loading={isLoading}
          onClick={() => setAlertsOpen((o) => !o)}
          expanded={alertsOpen}
        />
        <SummaryCard
          icon={FileText}
          label="Invoices Sent"
          value={String(sentCount)}
          color={sentCount > 0 ? "text-sky-700 dark:text-sky-400" : undefined}
          sub="awaiting payment"
          loading={isLoading}
          onClick={() => setSentOpen((o) => !o)}
          expanded={sentOpen}
        />
      </div>

      {/* Re-bill alerts panel — ad accounts whose monthly bill is due/overdue */}
      {alertsOpen && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b py-3 md:py-3">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle>Ad accounts to re-bill</CardTitle>
              <Badge variant="secondary">{alertRows.length} due/overdue</Badge>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setAlertsOpen(false)}
              aria-label="Close"
              className="text-muted-foreground"
            >
              <X />
            </Button>
          </CardHeader>
          {alertRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No ad accounts are due for re-billing. 🎉
            </p>
          ) : (
            <ul className="divide-y">
              {alertRows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 md:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.accountName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.clientName ?? "Unattached"}
                      {row.schedule.nextRebillAt
                        ? ` · due ${formatDate(row.schedule.nextRebillAt)}`
                        : ""}
                      {` · ${formatMoney(row.monthlyRetainerCents)}/mo`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <RebillStatusChip status={row.schedule.status} paid={row.schedule.paid} />
                    <Button size="sm" onClick={() => setInvoiceTarget(toInvoiceTarget(row))}>
                      <Send />
                      Send invoice
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Sent invoices panel — stored ad-account invoices awaiting payment */}
      {sentOpen && <AdAccountSentInvoicesPanel onClose={() => setSentOpen(false)} />}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search account, vendor, client…"
          aria-label="Search ad accounts"
          className="w-full sm:flex-1 sm:max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setGuideOpen(true)}
            className="flex-1 sm:flex-none"
            title="How Ad Accounts billing works"
          >
            <HelpCircle />
            Guide
          </Button>
          {!admin.isExternal && (
            <Button
              variant="outline"
              onClick={() => setPaymentSettingsOpen(true)}
              className="flex-1 sm:flex-none"
              title="Edit the bank details on ad-account invoices"
            >
              <CreditCard />
              Payment settings
            </Button>
          )}
          {/* A free invoice (no account) is internal-only — the send route
              refuses it for partner books, so don't offer it there. */}
          {!admin.isExternal && (
            <Button
              variant="outline"
              onClick={() => setInvoiceTarget(null)}
              className="flex-1 sm:flex-none"
            >
              <Send />
              Send ad invoice
            </Button>
          )}
          <Button onClick={() => setShowAdd(true)} className="flex-1 sm:flex-none">
            <Plus />
            Add Ad Account
          </Button>
        </div>
      </div>

      {isError && (
        <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
          Failed to load ad accounts. Refresh the page to try again.
        </div>
      )}

      {/* Table */}
      <Card>
        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="px-4 text-muted-foreground">Account</TableHead>
                <TableHead className="text-muted-foreground">Client</TableHead>
                <TableHead className="text-right text-muted-foreground">Ad Spend Fee</TableHead>
                <TableHead className="text-right text-muted-foreground">Monthly Retainer</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Next Bill</TableHead>
                <TableHead className="px-4 text-right text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [1, 2, 3, 4].map((i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell colSpan={7} className="px-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : paginated.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No ad accounts yet. Click “Add Ad Account” to create one.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="px-4">
                      <p className="truncate font-medium">{row.accountName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[row.vendor, row.platform].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {row.clientName ? (
                        <span>{row.clientName}</span>
                      ) : (
                        <Badge variant="secondary">Unattached</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {feeLabel(row.adSpendFeeBps)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(row.monthlyRetainerCents)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={row.status === "active" ? "success" : "neutral"}>
                        {row.status === "active" ? "Active" : "Inactive"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <RebillStatusChip status={row.schedule.status} paid={row.schedule.paid} />
                        {row.schedule.nextRebillAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(row.schedule.nextRebillAt)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex items-center justify-end">
                        <RowActions
                          accountName={row.accountName}
                          onInvoices={() => setInvoicesRow(row)}
                          onSend={() => setInvoiceTarget(toInvoiceTarget(row))}
                          onEdit={() => setEditing(row)}
                          onRemove={() => handleDelete(row)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : paginated.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No ad accounts yet.
            </p>
          ) : (
            <div className="divide-y">
              {paginated.map((row) => (
                <div key={row.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.accountName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[row.vendor, row.platform].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <StatusBadge tone={row.status === "active" ? "success" : "neutral"}>
                        {row.status === "active" ? "Active" : "Inactive"}
                      </StatusBadge>
                      <RowActions
                        accountName={row.accountName}
                        onInvoices={() => setInvoicesRow(row)}
                        onSend={() => setInvoiceTarget(toInvoiceTarget(row))}
                        onEdit={() => setEditing(row)}
                        onRemove={() => handleDelete(row)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Field label="Client">
                      {row.clientName ? (
                        <span>{row.clientName}</span>
                      ) : (
                        <span className="text-muted-foreground">Unattached</span>
                      )}
                    </Field>
                    <Field label="Ad spend fee">
                      <span className="font-medium tabular-nums">
                        {feeLabel(row.adSpendFeeBps)}
                      </span>
                    </Field>
                    <Field label="Monthly retainer">
                      <span className="font-medium tabular-nums">
                        {formatMoney(row.monthlyRetainerCents)}
                      </span>
                    </Field>
                    <Field label="Next bill">
                      <span className="flex items-center gap-1.5">
                        <RebillStatusChip status={row.schedule.status} paid={row.schedule.paid} />
                      </span>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="border-t px-4 pb-3">
            <Pagination
              page={currentPage}
              pageSize={PAGE_SIZE}
              totalItems={filtered.length}
              onPageChange={setPage}
              itemLabel={`Showing ${paginated.length} of ${filtered.length}`}
            />
          </div>
        )}
      </Card>

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
      {liveInvoicesRow && (
        <AdAccountInvoicesDrawer
          accountId={liveInvoicesRow.id}
          accountName={liveInvoicesRow.accountName}
          defaultCycleAnchor={liveInvoicesRow.schedule.nextRebillAt}
          schedulePaid={liveInvoicesRow.schedule.paid}
          defaultRecipientEmail={liveInvoicesRow.clientEmail}
          defaultRetainerCents={liveInvoicesRow.monthlyRetainerCents}
          onClose={() => setInvoicesRow(null)}
          onChanged={refresh}
        />
      )}
      {guideOpen && <AdAccountsGuide onClose={() => setGuideOpen(false)} />}
      {paymentSettingsOpen && (
        <AdAccountPaymentSettingsModal onClose={() => setPaymentSettingsOpen(false)} />
      )}
      {dialog}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/** Per-row actions: invoice history, send, edit, remove. */
function RowActions({
  accountName,
  onInvoices,
  onSend,
  onEdit,
  onRemove,
}: {
  accountName: string;
  onInvoices: () => void;
  onSend: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  // The invoice drawers are hand-built and move focus into themselves on
  // open — don't let the closing menu pull it back to the trigger behind them.
  const keepFocus = useRef(false);
  // The drawers return focus to whatever was focused when they opened; make
  // that the row's trigger (the menu item is gone by then), not <body>.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openDrawer = (open: () => void) => {
    keepFocus.current = true;
    triggerRef.current?.focus();
    open();
  };
  return (
    // modal={false}: the items open drawers / dialogs; a modal menu closing
    // underneath them can leave <body> pointer-events stuck.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon-sm"
          title="Actions"
          aria-label={`Actions for ${accountName}`}
          // 40px touch target on phones, dense on desktop where a pointer is precise.
          className="size-10 text-muted-foreground md:size-8"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-44"
        onCloseAutoFocus={(e) => {
          if (keepFocus.current) {
            keepFocus.current = false;
            e.preventDefault();
          }
        }}
      >
        <DropdownMenuItem
          onSelect={() => openDrawer(onInvoices)}
        >
          <ReceiptText /> Invoices
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => openDrawer(onSend)}
        >
          <Send /> Send invoice
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2 /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  expanded,
}: {
  icon: typeof Megaphone;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  loading?: boolean;
  onClick?: () => void;
  /** Whether the panel this card toggles is open (clickable cards only). */
  expanded?: boolean;
}) {
  const card = (
    <Card
      className={cn(
        "flex h-full min-w-0 flex-col",
        onClick && "transition-colors group-hover:bg-muted/50"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 md:pb-2">
        <CardDescription className="truncate">{label}</CardDescription>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <div
              className={cn("truncate text-2xl font-semibold tracking-tight tabular-nums", color)}
              title={value}
            >
              {value}
            </div>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
  if (!onClick) return card;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="group block w-full min-w-0 rounded-[min(calc(var(--radius)*2.6),24px)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      {card}
    </button>
  );
}
