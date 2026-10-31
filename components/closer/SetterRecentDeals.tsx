"use client";

import { format, parseISO } from "date-fns";
import { formatCents } from "@/components/closers/types";
import { DealStatusBadge } from "@/components/closers/DealStatusBadge";
import { DealInvoiceStatusBadge } from "@/components/closers/DealInvoiceStatusBadge";
import { DealContractStatusBadge } from "@/components/closers/DealContractStatusBadge";
import type { SetterRecentDeal } from "@/lib/setterStats";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  deals: SetterRecentDeal[];
}

/** Status tone per tier (Badge pattern) — same hues as SETTER_TIER_BADGE. */
const TIER_TONE: Record<string, BadgeTone> = {
  A: "success",
  B: "info",
  C: "warning",
  D: "neutral",
};


function formatDate(raw: string | null): string {
  if (!raw) return "—";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-").map(Number);
      return format(new Date(y, m - 1, d), "MMM d, yyyy");
    }
    return format(parseISO(raw), "MMM d, yyyy");
  } catch {
    return raw;
  }
}

export function SetterRecentDeals({ deals }: Props) {
  if (deals.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 md:p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No deals attributed yet. Claim calendar events in <span className="font-medium text-foreground">Appointments</span> — when a closer books a deal for one, you&apos;ll be credited automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Table className="[&_td]:px-4 [&_th]:px-4">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Client</TableHead>
            <TableHead>Closer</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead>Contract</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead>Closing</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium truncate max-w-[12rem]">{d.clientName}</TableCell>
              <TableCell className="text-muted-foreground">{d.closerName ?? "—"}</TableCell>
              <TableCell>
                {d.setterTier ? (
                  <StatusBadge
                    tone={TIER_TONE[d.setterTier] ?? "neutral"}
                    title={d.noRetainer ? "No-retainer deal — capped at $500 payout per §3.8" : undefined}
                  >
                    {d.setterTier}
                    {d.noRetainer && <span className="opacity-70">·NR</span>}
                  </StatusBadge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="font-mono tabular-nums">{formatCents(d.dealValue)}</TableCell>
              <TableCell>
                <DealStatusBadge status={d.status} compact />
              </TableCell>
              <TableCell>
                {d.invoiceStatus ? (
                  <DealInvoiceStatusBadge status={d.invoiceStatus} />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {d.contractStatus ? (
                  <DealContractStatusBadge status={d.contractStatus} />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge tone={d.paidStatus === "paid" ? "success" : "danger"} className="capitalize">
                  {d.paidStatus}
                </StatusBadge>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(d.closingDate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
