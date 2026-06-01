import crypto from "crypto";
import type { InvoiceData, PaymentType } from "@/types/invoice";
import { calculateTotals } from "./invoice/validation";
import {
  getAgencySender,
  getPaymentTemplate,
  getDefaultLogo,
  getDefaultThemeColor,
} from "./agencyConfig";
import {
  buildAdAccountLineItems,
  computeAdSpendFeeCents,
  feeBpsToPercentLabel,
} from "./adAccountLineItem";

export type { AdInvoiceType } from "./adAccountLineItem";
export {
  computeAdSpendFeeCents,
  feeBpsToPercentLabel,
  adInvoiceType,
} from "./adAccountLineItem";

/**
 * Build a prefilled InvoiceData for an ad-account invoice. Reuses the agency
 * sender / payment template / logo / theme (Agency Collective branding). The
 * invoice carries both the monthly retainer and the ad-spend fee as canonical
 * line items (each included only when its amount is > 0); the drawer recomputes
 * them locally via the same shared helper.
 */
export async function generateAdAccountInvoiceData(params: {
  clientName: string;
  clientEmail: string | null;
  invoiceNumber: string;
  paymentType?: PaymentType;
  accountName?: string | null;
  vendor?: string | null;
  monthlyRetainerCents?: number;
  spendCents?: number;
  feeBps?: number;
}): Promise<InvoiceData> {
  const paymentType: PaymentType =
    params.paymentType === "international" ? "international" : "local";

  const [sender, paymentTemplate, defaultLogo, defaultThemeColor] =
    await Promise.all([
      getAgencySender(),
      getPaymentTemplate(paymentType),
      getDefaultLogo(),
      getDefaultThemeColor(),
    ]);

  const items = buildAdAccountLineItems({
    retainerId: crypto.randomUUID(),
    adSpendId: crypto.randomUUID(),
    accountName: params.accountName,
    vendor: params.vendor,
    monthlyRetainerCents: params.monthlyRetainerCents,
    spendCents: params.spendCents,
    feeBps: params.feeBps,
    serviceProvider: sender.name || undefined,
  });

  const { subTotal, totalAmount } = calculateTotals(items, null, null, null);

  return {
    sender,
    receiver: {
      name: params.clientName,
      address: "",
      city: "",
      zipCode: "",
      country: "",
      email: params.clientEmail || "",
      phone: "",
      customInputs: [],
    },
    details: {
      invoiceLogo: defaultLogo,
      invoiceNumber: params.invoiceNumber,
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      terms: "Due on receipt",
      currency: "USD",
      themeColor: defaultThemeColor,
      templateNumber: 1,
      items,
      discountDetails: null,
      taxDetails: null,
      shippingDetails: null,
      paymentInfo: paymentTemplate,
      additionalNotes: "",
      noteToCustomer: "",
      paymentTerms: "",
      signature: null,
      totalInWords: false,
      subTotal,
      totalAmount,
    },
  };
}
