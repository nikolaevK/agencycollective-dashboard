"use client";

import type {
  PaymentInfo,
  PaymentType,
  DiscountDetails,
  TaxDetails,
  ShippingDetails,
  SignatureData,
} from "@/types/invoice";
import { formatCurrencyValue } from "@/lib/invoice/validation";
import { numberToWords } from "@/lib/invoice/numberToWords";
import { emptyPaymentInfo, loadPaymentInfoFromConfig } from "@/lib/invoice/paymentUtils";
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
  agencyConfig?: Record<string, string> | null;
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
  agencyConfig,
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

  const paymentType: PaymentType = paymentInfo?.paymentType ?? "local";

  const handleLoadTemplate = () => {
    const template = loadPaymentInfoFromConfig(agencyConfig, paymentType);
    if (template) {
      onPaymentInfoChange(template);
    }
  };

  const updateField = (field: keyof PaymentInfo, value: string) => {
    if (!paymentInfo) return;
    onPaymentInfoChange({ ...paymentInfo, [field]: value });
  };

  const handlePaymentTypeChange = (type: PaymentType) => {
    if (!paymentInfo) return;
    onPaymentInfoChange({ ...paymentInfo, paymentType: type });
  };

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

      {/* Payment Information */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={paymentInfo !== null}
            onChange={(e) =>
              onPaymentInfoChange(
                e.target.checked ? emptyPaymentInfo("local") : null
              )
            }
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Payment Information
          </span>
        </label>

        {paymentInfo && (
          <div className="space-y-4 pl-6">
            {/* Payment Type Toggle */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Payment Type
              </label>
              <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                <button
                  type="button"
                  onClick={() => handlePaymentTypeChange("local")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${paymentType === "local" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Local (Zelle + Wire)
                </button>
                <button
                  type="button"
                  onClick={() => handlePaymentTypeChange("international")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${paymentType === "international" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  International (Wire)
                </button>
              </div>
            </div>

            {/* Load from template */}
            {agencyConfig && (
              <button
                type="button"
                onClick={handleLoadTemplate}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Load from agency template
              </button>
            )}

            {/* Zelle Contact — Local only */}
            {paymentType === "local" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Zelle Contact (Phone / Email)
                </label>
                <input
                  type="text"
                  value={paymentInfo.zelleContact ?? ""}
                  onChange={(e) => updateField("zelleContact", e.target.value)}
                  placeholder="Phone number or email for Zelle"
                  className={INPUT_CLS}
                />
              </div>
            )}

            {/* SWIFT/BIC — International only */}
            {paymentType === "international" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  SWIFT / BIC Code
                </label>
                <input
                  type="text"
                  value={paymentInfo.swiftBic ?? ""}
                  onChange={(e) => updateField("swiftBic", e.target.value)}
                  placeholder="e.g. CLNOUS66MER"
                  className={INPUT_CLS}
                />
              </div>
            )}

            {/* Common fields */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Bank Name
              </label>
              <input
                type="text"
                value={paymentInfo.bankName}
                onChange={(e) => updateField("bankName", e.target.value)}
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
                onChange={(e) => updateField("accountName", e.target.value)}
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
                onChange={(e) => updateField("accountNumber", e.target.value)}
                placeholder="Account number / IBAN"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Routing Number
              </label>
              <input
                type="text"
                value={paymentInfo.routingNumber ?? ""}
                onChange={(e) => updateField("routingNumber", e.target.value)}
                placeholder="ABA routing number"
                className={INPUT_CLS}
              />
            </div>

            {/* Alternate Routing — International only */}
            {paymentType === "international" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Alternate Routing Number
                </label>
                <input
                  type="text"
                  value={paymentInfo.alternateRoutingNumber ?? ""}
                  onChange={(e) => updateField("alternateRoutingNumber", e.target.value)}
                  placeholder="If sending bank doesn't recognize primary ABA"
                  className={INPUT_CLS}
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Bank Address
              </label>
              <textarea
                value={paymentInfo.bankAddress ?? ""}
                onChange={(e) => updateField("bankAddress", e.target.value)}
                placeholder="Bank address"
                rows={2}
                className={TEXTAREA_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Beneficiary Name
              </label>
              <input
                type="text"
                value={paymentInfo.beneficiaryName ?? ""}
                onChange={(e) => updateField("beneficiaryName", e.target.value)}
                placeholder="Beneficiary name"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Beneficiary Address
              </label>
              <textarea
                value={paymentInfo.beneficiaryAddress ?? ""}
                onChange={(e) => updateField("beneficiaryAddress", e.target.value)}
                placeholder="Beneficiary address"
                rows={2}
                className={TEXTAREA_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Memo / Reference
              </label>
              <input
                type="text"
                value={paymentInfo.memo ?? ""}
                onChange={(e) => updateField("memo", e.target.value)}
                placeholder="e.g. Digital Service/Work - Non Refundable"
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

      {/* Note to Customer */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Note to Customer
        </h3>
        <textarea
          value={noteToCustomer}
          onChange={(e) => onNoteToCustomerChange(e.target.value)}
          placeholder="Any special instructions or notes for the customer..."
          rows={4}
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
