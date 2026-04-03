"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { InvoicePage } from "@/components/invoice/InvoicePage";

export default function InvoicePageRoute() {
  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-black text-foreground">
            Invoice Generator
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create and download professional invoices
          </p>
        </div>
        <InvoicePage />
      </div>
    </DashboardShell>
  );
}
