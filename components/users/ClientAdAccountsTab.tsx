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
  ReceiptText,
  HelpCircle,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/use-confirm";
import { RebillStatusChip } from "./RebillStatusChip";
import { AdAccountFormModal } from "./AdAccountFormModal";
import type { AdAccountInvoiceTarget } from "./AdAccountInvoiceDrawer";
// Lazy-loaded: pulls in @react-pdf/renderer only when the admin opens the
// invoice drawer, keeping the per-client page's initial bundle light.
const AdAccountInvoiceDrawer = dynamic(
  () => import("./AdAccountInvoiceDrawer").then((m) => m.AdAccountInvoiceDrawer),
  { ssr: false }
);
import { AdAccountInvoicesDrawer } from "./AdAccountInvoicesDrawer";
import { AdAccountsGuide } from "./AdAccountsGuide";
import { formatMoney, formatDate } from "./format";
import type { AdAccountDirectoryRow, AdAccountSummary } from "@/lib/adAccountDirectory";
import { toOpenInvoiceRefs } from "./openInvoices";

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
  const { confirm, dialog } = useConfirm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-ad-accounts"],
    queryFn: fetchAdAccounts,
    staleTime: 30_000,
  });

  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => r.userId === userId),
    [data, userId]
  );
  // The drawer reads the LIVE row: a Mark paid / Set cycle inside it refetches
  // the directory, and the snapshot taken on open would keep showing the old
  // "(current)" cycle and paid hint.
  const liveInvoicesRow = invoicesRow
    ? rows.find((r) => r.id === invoicesRow.id) ?? invoicesRow
    : null;

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
      nextRebillAt: row.schedule.nextRebillAt,
      openInvoices: toOpenInvoiceRefs(row.sentInvoices),
    });
    setDrawerOpen(true);
  }

  async function handleDelete(row: AdAccountDirectoryRow) {
    if (
      !(await confirm({
        title: `Remove ad account "${row.accountName}"?`,
        confirmText: "Remove",
        destructive: true,
      }))
    )
      return;
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-medium">Ad Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Agency ad accounts this client has purchased — retainer + ad-spend fee.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGuideOpen(true)}
            title="How Ad Accounts billing works"
          >
            <HelpCircle />
            Guide
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus />
            Add
          </Button>
        </div>
      </div>

      {isError ? (
        <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
          Failed to load ad accounts. Refresh to try again.
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Megaphone className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No ad accounts yet.{" "}
            <Button
              variant="link"
              onClick={() => setShowAdd(true)}
              className="h-auto p-0 text-foreground"
            >
              Add one
            </Button>
          </p>
        </Card>
      ) : (
        <Card className="divide-y">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{row.accountName}</p>
                  <StatusBadge tone={row.status === "active" ? "success" : "neutral"}>
                    {row.status === "active" ? "Active" : "Inactive"}
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
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
                <RowActions
                  accountName={row.accountName}
                  onInvoices={() => setInvoicesRow(row)}
                  onSend={() => openInvoice(row)}
                  onEdit={() => setEditing(row)}
                  onRemove={() => handleDelete(row)}
                />
              </div>
            </div>
          ))}
        </Card>
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
      {dialog}
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
          className="text-muted-foreground"
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
