import crypto from "crypto";
import type { InvoiceData, InvoiceItem, PaymentType } from "@/types/invoice";
import { calculateTotals } from "./invoice/validation";
import { businessTodayYmd } from "./businessTime";
import {
  getAgencySender,
  getPaymentTemplate,
  getDefaultLogo,
  getDefaultThemeColor,
} from "./agencyConfig";

/**
 * Build a prefilled InvoiceData for a re-bill invoice to a CLIENT (not a deal).
 * Mirrors `generateInvoiceFromDeal` — same agency sender / payment template /
 * logo / theme — but seeds a single line item from the client's monthly amount.
 * The admin then adjusts (add presets, edit amounts) before sending.
 */
export async function generateClientInvoiceData(params: {
  clientName: string;
  clientEmail: string | null;
  amountCents: number;
  serviceName?: string | null;
  invoiceNumber: string;
  paymentType?: PaymentType;
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

  // InvoiceData works in dollars (cents / 100), matching generateInvoiceFromDeal.
  const unitPrice = Math.max(0, Math.round(params.amountCents)) / 100;
  const items: InvoiceItem[] = [
    {
      id: crypto.randomUUID(),
      name: params.serviceName?.trim() || "Monthly Retainer",
      description: "",
      quantity: 1,
      unitPrice,
      total: unitPrice,
    },
  ];

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

/**
 * Unique invoice number for a client re-bill. Client invoices are filed in
 * payout_documents (no invoice_number column), so we can't derive a safe
 * sequential number the way deal invoices do — a random suffix guarantees
 * uniqueness across clients and concurrent opens, and the distinct format
 * (hex suffix vs the deal `-NNN`) avoids colliding with deal invoice numbers.
 */
export function generateClientInvoiceNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `INV-${ymd}-${suffix}`;
}
