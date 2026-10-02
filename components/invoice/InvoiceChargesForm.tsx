"use client";

import { useEffect, useState } from "react";
import type { AmountType, DiscountDetails, TaxDetails, ShippingDetails } from "@/types/invoice";
import { parseDecimalInput } from "@/lib/invoice/validation";
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

export function TypeToggle({
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

/** A percentage charge is capped at 100 (also applied when toggling $ → %). */
function capPercent(type: AmountType, n: number): number {
  return type === "percentage" ? Math.min(n, 100) : n;
}

/**
 * Decimal input that keeps what's being typed. A `type="number"` field bound
 * to `value || ""` cleared itself at the "0" of "0.5"; this keeps the text
 * ("0.", "1,500") and reports the parsed number (parseDecimalInput: `$`,
 * grouping commas and a decimal comma are understood, negatives can't be
 * typed). A value above `max` is clamped to it.
 */
export function DecimalInput({
  value,
  onChange,
  maxDecimals = 2,
  max,
  disabled,
  placeholder,
  ariaLabel,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  maxDecimals?: number;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  // Follow outside changes (preset picked, reorder, reset, $/% toggle) without
  // clobbering an in-progress "1." that already parses to the same number.
  useEffect(() => {
    setText((t) => ((parseDecimalInput(t, maxDecimals) ?? 0) === value ? t : value ? String(value) : ""));
  }, [value, maxDecimals]);
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        let t = e.target.value.replace(/[$\s]/g, "");
        let n = parseDecimalInput(t, maxDecimals);
        if (n === null) return;
        if (max !== undefined && n > max) {
          n = max;
          t = String(max);
        }
        setText(t);
        onChange(n);
      }}
      className={className}
    />
  );
}

/**
 * Discount checkbox + amount + $/% toggle — shared by the Invoice page
 * (below, inside Additional Charges) and the client re-bill drawer, so both
 * editors of DiscountDetails behave identically. Negatives can't be typed (a
 * negative would INFLATE the total via calculateTotals' subtraction) and a
 * percentage is capped at 100 — 150% used to print "Discount (150%)" while
 * only 100% applied.
 */
export function DiscountField({
  discount,
  onChange,
}: {
  discount: DiscountDetails | null;
  onChange: (d: DiscountDetails | null) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={discount !== null}
          onChange={(e) =>
            onChange(
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
          <DecimalInput
            value={discount.amount}
            max={discount.amountType === "percentage" ? 100 : undefined}
            onChange={(amount) => onChange({ ...discount, amount })}
            placeholder="0"
            ariaLabel="Discount"
            className={cn(INPUT_CLS, "w-32")}
          />
          <TypeToggle
            value={discount.amountType}
            onChange={(amountType) =>
              onChange({ ...discount, amountType, amount: capPercent(amountType, discount.amount) })
            }
          />
        </div>
      )}
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

      <DiscountField discount={discount} onChange={onDiscountChange} />

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
            <DecimalInput
              value={tax.amount}
              max={tax.amountType === "percentage" ? 100 : undefined}
              onChange={(amount) => onTaxChange({ ...tax, amount })}
              placeholder="0"
              ariaLabel="Tax"
              className={cn(INPUT_CLS, "w-32")}
            />
            <TypeToggle
              value={tax.amountType}
              onChange={(amountType) =>
                onTaxChange({ ...tax, amountType, amount: capPercent(amountType, tax.amount) })
              }
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
            <DecimalInput
              value={shipping.cost}
              max={shipping.costType === "percentage" ? 100 : undefined}
              onChange={(cost) => onShippingChange({ ...shipping, cost })}
              placeholder="0"
              ariaLabel="Shipping"
              className={cn(INPUT_CLS, "w-32")}
            />
            <TypeToggle
              value={shipping.costType}
              onChange={(costType) =>
                onShippingChange({ ...shipping, costType, cost: capPercent(costType, shipping.cost) })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
