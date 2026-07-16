import crypto from "crypto";
import type { InvoiceData, PaymentType } from "@/types/invoice";
import { calculateTotals } from "./invoice/validation";
import { businessTodayYmd } from "./businessTime";
import {
  getAgencySender,
  getAdAccountPaymentTemplate,
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
 * sender / logo / theme (Agency Collective branding), and pulls the payment
 * block from the DEDICATED ad-account payment template (`getAdAccountPayment-
 * Template`) — admin-editable in the Ad Accounts → Payment settings modal,
 * separate from the shared template deal / client-rebill invoices use. The
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

  const [sender, paymentInfo, defaultLogo, defaultThemeColor] =
    await Promise.all([
      getAgencySender(),
      getAdAccountPaymentTemplate(paymentType),
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
      invoiceDate: businessTodayYmd(),
      dueDate: "",
      terms: "Due on receipt",
      currency: "USD",
      themeColor: defaultThemeColor,
      templateNumber: 1,
      items,
      discountDetails: null,
      taxDetails: null,
      shippingDetails: null,
      paymentInfo,
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
