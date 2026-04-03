"use client";

import type { DiscountDetails, TaxDetails, ShippingDetails } from "@/types/invoice";
import { cn } from "@/lib/utils";
import { INPUT_CLS } from "./styles";

interface Props {
  discount: DiscountDetails | null;
  tax: TaxDetails | null;
  shipping: ShippingDetails | null;
  currency: string;
  onDiscountChange: (d: DiscountDetails | null) => void;
  onTaxChange: (t: TaxDetails | null) => void;
  onShippingChange: (s: ShippingDetails | null) => void;
}

function TypeToggle({
  value,
  onChange,
}: {
  value: "amount" | "percentage";
  onChange: (v: "amount" | "percentage") => void;
}) {
  return (
    <div className="flex rounded-md border border-input overflow-hidden">
      <button
        type="button"
        onClick={() => onChange("amount")}
        className={cn(
          "px-2.5 py-1 text-xs font-medium transition-colors",
          value === "amount"
            ? "bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:bg-accent"
        )}
      >
        $
      </button>
      <button
        type="button"
        onClick={() => onChange("percentage")}
        className={cn(
          "px-2.5 py-1 text-xs font-medium transition-colors border-l border-input",
          value === "percentage"
            ? "bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:bg-accent"
        )}
      >
        %
      </button>
    </div>
  );
}

export function InvoiceChargesForm({
  discount,
  tax,
  shipping,
  onDiscountChange,
  onTaxChange,
  onShippingChange,
}: Props) {
  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
        Additional Charges
      </h3>

      {/* Discount */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={discount !== null}
            onChange={(e) =>
              onDiscountChange(
                e.target.checked
                  ? { amount: 0, amountType: "amount" }
                  : null
              )
            }
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-foreground">Discount</span>
        </label>
        {discount && (
          <div className="flex items-center gap-2 pl-6">
            <input
              type="number"
              min="0"
              step="any"
              value={discount.amount || ""}
              onChange={(e) =>
                onDiscountChange({
                  ...discount,
                  amount: parseFloat(e.target.value) || 0,
                })
              }
              placeholder="0"
              className={cn(INPUT_CLS, "w-32")}
            />
            <TypeToggle
              value={discount.amountType}
              onChange={(amountType) =>
                onDiscountChange({ ...discount, amountType })
              }
            />
          </div>
        )}
      </div>

      {/* Tax */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={tax !== null}
            onChange={(e) =>
              onTaxChange(
                e.target.checked
                  ? { amount: 0, taxId: "", amountType: "percentage" }
                  : null
              )
            }
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-foreground">Tax</span>
        </label>
        {tax && (
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <input
              type="number"
              min="0"
              step="any"
              value={tax.amount || ""}
              onChange={(e) =>
                onTaxChange({
                  ...tax,
                  amount: parseFloat(e.target.value) || 0,
                })
              }
              placeholder="0"
              className={cn(INPUT_CLS, "w-32")}
            />
            <TypeToggle
              value={tax.amountType}
              onChange={(amountType) => onTaxChange({ ...tax, amountType })}
            />
            <input
              type="text"
              value={tax.taxId}
              onChange={(e) => onTaxChange({ ...tax, taxId: e.target.value })}
              placeholder="Tax ID (optional)"
              className={cn(INPUT_CLS, "w-40")}
            />
          </div>
        )}
      </div>

      {/* Shipping */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={shipping !== null}
            onChange={(e) =>
              onShippingChange(
                e.target.checked
                  ? { cost: 0, costType: "amount" }
                  : null
              )
            }
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-foreground">Shipping</span>
        </label>
        {shipping && (
          <div className="flex items-center gap-2 pl-6">
            <input
              type="number"
              min="0"
              step="any"
              value={shipping.cost || ""}
              onChange={(e) =>
                onShippingChange({
                  ...shipping,
                  cost: parseFloat(e.target.value) || 0,
                })
              }
              placeholder="0"
              className={cn(INPUT_CLS, "w-32")}
            />
            <TypeToggle
              value={shipping.costType}
              onChange={(costType) =>
                onShippingChange({ ...shipping, costType })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
