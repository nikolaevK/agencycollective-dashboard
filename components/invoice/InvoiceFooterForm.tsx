"use client";

import type {
  PaymentInfo,
  DiscountDetails,
  TaxDetails,
  ShippingDetails,
  SignatureData,
} from "@/types/invoice";
import { formatCurrencyValue } from "@/lib/invoice/validation";
import { numberToWords } from "@/lib/invoice/numberToWords";
import { InvoiceSignature } from "./InvoiceSignature";
import { INPUT_CLS, TEXTAREA_CLS } from "./styles";

interface Props {
  paymentInfo: PaymentInfo | null;
  additionalNotes: string;
  noteToCustomer: string;
  paymentTerms: string;
  signature: SignatureData | null;
  totalInWords: boolean;
  subTotal: number;
  totalAmount: number;
  discount: DiscountDetails | null;
  tax: TaxDetails | null;
  shipping: ShippingDetails | null;
  currency: string;
  onPaymentInfoChange: (info: PaymentInfo | null) => void;
  onNotesChange: (notes: string) => void;
  onNoteToCustomerChange: (note: string) => void;
  onPaymentTermsChange: (terms: string) => void;
  onSignatureChange: (sig: SignatureData | null) => void;
  onTotalInWordsChange: (enabled: boolean) => void;
}

export function InvoiceFooterForm({
  paymentInfo,
  additionalNotes,
  noteToCustomer,
  paymentTerms,
  signature,
  totalInWords,
  subTotal,
  totalAmount,
  discount,
  tax,
  shipping,
  currency,
  onPaymentInfoChange,
  onNotesChange,
  onNoteToCustomerChange,
  onPaymentTermsChange,
  onSignatureChange,
  onTotalInWordsChange,
}: Props) {
  const discountAmount = discount
    ? discount.amountType === "percentage"
      ? subTotal * (discount.amount / 100)
      : discount.amount
    : 0;

  const taxAmount = tax
    ? tax.amountType === "percentage"
      ? subTotal * (tax.amount / 100)
      : tax.amount
    : 0;

  const shippingAmount = shipping
    ? shipping.costType === "percentage"
      ? subTotal * (shipping.cost / 100)
      : shipping.cost
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Summary
        </h3>

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrencyValue(subTotal, currency)}</span>
          </div>

          {discount && discountAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>
                Discount
                {discount.amountType === "percentage" && ` (${discount.amount}%)`}
              </span>
              <span className="text-destructive">
                -{formatCurrencyValue(discountAmount, currency)}
              </span>
            </div>
          )}

          {tax && taxAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>
                Tax
                {tax.amountType === "percentage" && ` (${tax.amount}%)`}
                {tax.taxId && ` — ${tax.taxId}`}
              </span>
              <span>+{formatCurrencyValue(taxAmount, currency)}</span>
            </div>
          )}

          {shipping && shippingAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>
                Shipping
                {shipping.costType === "percentage" && ` (${shipping.cost}%)`}
              </span>
              <span>+{formatCurrencyValue(shippingAmount, currency)}</span>
            </div>
          )}

          <div className="border-t border-border pt-2 flex justify-between font-semibold text-foreground text-base">
            <span>Total</span>
            <span>{formatCurrencyValue(totalAmount, currency)}</span>
          </div>

          {totalInWords && totalAmount > 0 && (
            <p className="text-xs text-muted-foreground italic pt-1">
              {numberToWords(totalAmount, currency)}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={totalInWords}
            onChange={(e) => onTotalInWordsChange(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">
            Show total in words
          </span>
        </label>
      </div>

      {/* Payment info */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={paymentInfo !== null}
            onChange={(e) =>
              onPaymentInfoChange(
                e.target.checked
                  ? { bankName: "", accountName: "", accountNumber: "" }
                  : null
              )
            }
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Payment Information
          </span>
        </label>

        {paymentInfo && (
          <div className="space-y-3 pl-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Bank Name
              </label>
              <input
                type="text"
                value={paymentInfo.bankName}
                onChange={(e) =>
                  onPaymentInfoChange({ ...paymentInfo, bankName: e.target.value })
                }
                placeholder="Bank name"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Account Name
              </label>
              <input
                type="text"
                value={paymentInfo.accountName}
                onChange={(e) =>
                  onPaymentInfoChange({ ...paymentInfo, accountName: e.target.value })
                }
                placeholder="Account holder name"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Account Number
              </label>
              <input
                type="text"
                value={paymentInfo.accountNumber}
                onChange={(e) =>
                  onPaymentInfoChange({ ...paymentInfo, accountNumber: e.target.value })
                }
                placeholder="Account number / IBAN"
                className={INPUT_CLS}
              />
            </div>
          </div>
        )}
      </div>

      {/* Payment terms */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Payment Terms
        </h3>
        <textarea
          value={paymentTerms}
          onChange={(e) => onPaymentTermsChange(e.target.value)}
          placeholder="e.g. Net 30, due upon receipt..."
          rows={2}
          className={TEXTAREA_CLS}
        />
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Additional Notes
        </h3>
        <textarea
          value={additionalNotes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Thank you for your business..."
          rows={3}
          className={TEXTAREA_CLS}
        />
      </div>

      {/* Note to Customer (Ways to pay / payment instructions) */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Note to Customer
        </h3>
        <textarea
          value={noteToCustomer}
          onChange={(e) => onNoteToCustomerChange(e.target.value)}
          placeholder="Payment instructions, wire/Zelle details, refund policy..."
          rows={6}
          className={TEXTAREA_CLS}
        />
      </div>

      {/* Signature */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5">
        <InvoiceSignature
          signature={signature}
          onChange={onSignatureChange}
        />
      </div>
    </div>
  );
}
