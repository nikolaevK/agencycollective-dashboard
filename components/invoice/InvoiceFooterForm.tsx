"use client";

import { useId } from "react";
import type {
  PaymentInfo,
  PaymentType,
  DiscountDetails,
  TaxDetails,
  ShippingDetails,
  SignatureData,
} from "@/types/invoice";
import {
  discountValueOf,
  formatCurrencyValue,
  shippingValueOf,
  taxValueOf,
} from "@/lib/invoice/validation";
import { numberToWords } from "@/lib/invoice/numberToWords";
import { emptyPaymentInfo, loadPaymentInfoFromConfig } from "@/lib/invoice/paymentUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { InvoiceSignature } from "./InvoiceSignature";
import { InvoiceField, SEGMENT_ITEM, SEGMENT_TRACK } from "./InvoiceField";

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
  const id = useId();
  const discountAmount = discountValueOf(subTotal, discount);
  const taxAmount = taxValueOf(subTotal, tax);
  const shippingAmount = shippingValueOf(subTotal, shipping);

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
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrencyValue(subTotal, currency)}</span>
            </div>

            {discount && discountAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>
                  Discount
                  {discount.amountType === "percentage" && ` (${discount.amount}%)`}
                </span>
                <span className="tabular-nums text-destructive">
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
                <span className="tabular-nums">+{formatCurrencyValue(taxAmount, currency)}</span>
              </div>
            )}

            {shipping && shippingAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>
                  Shipping
                  {shipping.costType === "percentage" && ` (${shipping.cost}%)`}
                </span>
                <span className="tabular-nums">+{formatCurrencyValue(shippingAmount, currency)}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-3 text-foreground">
              <span className="font-medium">Total</span>
              <span className="text-lg font-semibold tracking-tight tabular-nums">
                {formatCurrencyValue(totalAmount, currency)}
              </span>
            </div>

            {totalInWords && totalAmount > 0 && (
              <p className="pt-1 text-xs italic text-muted-foreground">
                {numberToWords(totalAmount, currency)}
              </p>
            )}
          </div>

          <Label className="cursor-pointer font-normal text-muted-foreground">
            <Checkbox
              checked={totalInWords}
              onCheckedChange={(checked) => onTotalInWordsChange(checked === true)}
            />
            Show total in words
          </Label>
        </CardContent>
      </Card>

      {/* Payment Information */}
      <Card>
        <CardHeader>
          <Label className="cursor-pointer text-base leading-snug">
            <Checkbox
              checked={paymentInfo !== null}
              onCheckedChange={(checked) =>
                onPaymentInfoChange(checked === true ? emptyPaymentInfo("local") : null)
              }
            />
            Payment Information
          </Label>
        </CardHeader>

        {paymentInfo && (
          <CardContent className="space-y-4">
            {/* Payment Type Toggle — re-clicking the pressed type re-applies it */}
            <div className="grid gap-2">
              <span id={`${id}-payment-type`} className="text-sm font-medium leading-none">
                Payment Type
              </span>
              <div role="group" aria-labelledby={`${id}-payment-type`} className={cn("w-full", SEGMENT_TRACK)}>
                {(
                  [
                    ["local", "Local (Zelle + Wire)"],
                    ["international", "International (Wire)"],
                  ] as const
                ).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={paymentType === type}
                    onClick={() => handlePaymentTypeChange(type)}
                    className={cn(SEGMENT_ITEM, "min-w-0 flex-1 px-2")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Load from template */}
            {agencyConfig && (
              <Button type="button" variant="link" size="xs" onClick={handleLoadTemplate} className="px-0">
                Load from agency template
              </Button>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Zelle Contact — Local only */}
              {paymentType === "local" && (
                <InvoiceField label="Zelle Contact (Phone / Email)" htmlFor={`${id}-zelle`} className="sm:col-span-2">
                  <Input
                    id={`${id}-zelle`}
                    type="text"
                    value={paymentInfo.zelleContact ?? ""}
                    onChange={(e) => updateField("zelleContact", e.target.value)}
                    placeholder="Phone number or email for Zelle"
                  />
                </InvoiceField>
              )}

              {/* SWIFT/BIC — International only */}
              {paymentType === "international" && (
                <InvoiceField label="SWIFT / BIC Code" htmlFor={`${id}-swift`} className="sm:col-span-2">
                  <Input
                    id={`${id}-swift`}
                    type="text"
                    value={paymentInfo.swiftBic ?? ""}
                    onChange={(e) => updateField("swiftBic", e.target.value)}
                    placeholder="e.g. CLNOUS66MER"
                  />
                </InvoiceField>
              )}

              {/* Common fields */}
              <InvoiceField label="Bank Name" htmlFor={`${id}-bank`}>
                <Input
                  id={`${id}-bank`}
                  type="text"
                  value={paymentInfo.bankName}
                  onChange={(e) => updateField("bankName", e.target.value)}
                  placeholder="Bank name"
                />
              </InvoiceField>
              <InvoiceField label="Account Name" htmlFor={`${id}-acct-name`}>
                <Input
                  id={`${id}-acct-name`}
                  type="text"
                  value={paymentInfo.accountName}
                  onChange={(e) => updateField("accountName", e.target.value)}
                  placeholder="Account holder name"
                />
              </InvoiceField>
              <InvoiceField label="Account Number" htmlFor={`${id}-acct-number`}>
                <Input
                  id={`${id}-acct-number`}
                  type="text"
                  value={paymentInfo.accountNumber}
                  onChange={(e) => updateField("accountNumber", e.target.value)}
                  placeholder="Account number / IBAN"
                />
              </InvoiceField>
              <InvoiceField label="Routing Number" htmlFor={`${id}-routing`}>
                <Input
                  id={`${id}-routing`}
                  type="text"
                  value={paymentInfo.routingNumber ?? ""}
                  onChange={(e) => updateField("routingNumber", e.target.value)}
                  placeholder="ABA routing number"
                />
              </InvoiceField>

              {/* Alternate Routing — International only */}
              {paymentType === "international" && (
                <InvoiceField label="Alternate Routing Number" htmlFor={`${id}-alt-routing`} className="sm:col-span-2">
                  <Input
                    id={`${id}-alt-routing`}
                    type="text"
                    value={paymentInfo.alternateRoutingNumber ?? ""}
                    onChange={(e) => updateField("alternateRoutingNumber", e.target.value)}
                    placeholder="If sending bank doesn't recognize primary ABA"
                  />
                </InvoiceField>
              )}

              <InvoiceField label="Bank Address" htmlFor={`${id}-bank-address`} className="sm:col-span-2">
                <Textarea
                  id={`${id}-bank-address`}
                  value={paymentInfo.bankAddress ?? ""}
                  onChange={(e) => updateField("bankAddress", e.target.value)}
                  placeholder="Bank address"
                  rows={2}
                  className="resize-y"
                />
              </InvoiceField>
              <InvoiceField label="Beneficiary Name" htmlFor={`${id}-beneficiary`} className="sm:col-span-2">
                <Input
                  id={`${id}-beneficiary`}
                  type="text"
                  value={paymentInfo.beneficiaryName ?? ""}
                  onChange={(e) => updateField("beneficiaryName", e.target.value)}
                  placeholder="Beneficiary name"
                />
              </InvoiceField>
              <InvoiceField label="Beneficiary Address" htmlFor={`${id}-beneficiary-address`} className="sm:col-span-2">
                <Textarea
                  id={`${id}-beneficiary-address`}
                  value={paymentInfo.beneficiaryAddress ?? ""}
                  onChange={(e) => updateField("beneficiaryAddress", e.target.value)}
                  placeholder="Beneficiary address"
                  rows={2}
                  className="resize-y"
                />
              </InvoiceField>
              <InvoiceField label="Memo / Reference" htmlFor={`${id}-memo`} className="sm:col-span-2">
                <Input
                  id={`${id}-memo`}
                  type="text"
                  value={paymentInfo.memo ?? ""}
                  onChange={(e) => updateField("memo", e.target.value)}
                  placeholder="e.g. Digital Service/Work - Non Refundable"
                />
              </InvoiceField>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Payment terms */}
      <TextCard
        id={`${id}-terms`}
        title="Payment Terms"
        value={paymentTerms}
        onChange={onPaymentTermsChange}
        placeholder="e.g. Net 30, due upon receipt..."
        rows={2}
      />

      {/* Notes */}
      <TextCard
        id={`${id}-notes`}
        title="Additional Notes"
        value={additionalNotes}
        onChange={onNotesChange}
        placeholder="Thank you for your business..."
        rows={3}
      />

      {/* Note to Customer */}
      <TextCard
        id={`${id}-note-to-customer`}
        title="Note to Customer"
        value={noteToCustomer}
        onChange={onNoteToCustomerChange}
        placeholder="Any special instructions or notes for the customer..."
        rows={4}
      />

      {/* Signature */}
      <Card>
        <CardContent className="pt-4 md:pt-6">
          <InvoiceSignature signature={signature} onChange={onSignatureChange} />
        </CardContent>
      </Card>
    </div>
  );
}

/** A titled card holding one free-text field (its title is the field's label). */
function TextCard({
  id,
  title,
  value,
  onChange,
  placeholder,
  rows,
}: {
  id: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <label htmlFor={id}>{title}</label>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="resize-y"
        />
      </CardContent>
    </Card>
  );
}
