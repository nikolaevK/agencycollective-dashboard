"use client";

import {
  calculateTotals,
  discountValueOf,
  formatCurrencyValue,
  shippingValueOf,
  taxValueOf,
} from "@/lib/invoice/validation";
import type { InvoiceDetails } from "@/types/invoice";

/**
 * Totals block for the invoice drawers. Uses the same helpers as the PDF and
 * live preview, and the same rules (Subtotal whenever a charge is set, each
 * charge line only when > 0), so what the admin reviews here is exactly what
 * the client's invoice prints.
 */
export function InvoiceTotalsSummary({ details }: { details: InvoiceDetails }) {
  const { subTotal, totalAmount } = calculateTotals(
    details.items,
    details.discountDetails,
    details.taxDetails,
    details.shippingDetails
  );
  const discount = discountValueOf(subTotal, details.discountDetails);
  const tax = taxValueOf(subTotal, details.taxDetails);
  const shipping = shippingValueOf(subTotal, details.shippingDetails);
  const fmt = (n: number) => formatCurrencyValue(n, details.currency);
  const pct = (v: { amount: number; amountType: string } | null) =>
    v?.amountType === "percentage" ? ` (${v.amount}%)` : "";

  return (
    <div className="space-y-1 border-t border-border pt-3">
      {(details.discountDetails || details.taxDetails || details.shippingDetails) && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums text-foreground">{fmt(subTotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex items-center justify-between text-sm">
              {/* A percentage discount applies at most 100% — label legacy >100 values as applied. */}
              <span className="text-muted-foreground">
                Discount
                {pct(details.discountDetails && { ...details.discountDetails, amount: Math.min(100, details.discountDetails.amount) })}
              </span>
              <span className="tabular-nums text-red-600 dark:text-red-400">-{fmt(discount)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tax{pct(details.taxDetails)}</span>
              <span className="tabular-nums text-foreground">+{fmt(tax)}</span>
            </div>
          )}
          {shipping > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Shipping
                {details.shippingDetails?.costType === "percentage" ? ` (${details.shippingDetails.cost}%)` : ""}
              </span>
              <span className="tabular-nums text-foreground">+{fmt(shipping)}</span>
            </div>
          )}
        </>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Total</span>
        <span className="text-lg font-bold tabular-nums text-foreground">{fmt(totalAmount)}</span>
      </div>
    </div>
  );
}
