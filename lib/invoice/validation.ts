import { z } from "zod";
import type { InvoiceData, InvoiceItem, SavedInvoice } from "@/types/invoice";

// ── Zod Schemas ─────────────────────────────────────────────────────

const customInputSchema = z.object({
  id: z.string(),
  key: z.string().min(1, "Label is required").max(200),
  value: z.string().min(1, "Value is required").max(500),
});

const invoiceSenderSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  address: z.string().max(200).optional().default(""),
  city: z.string().max(100).optional().default(""),
  zipCode: z.string().max(20).optional().default(""),
  country: z.string().max(100).optional().default(""),
  email: z.string().email("Invalid email").or(z.literal("")),
  phone: z.string().max(50).optional().default(""),
  customInputs: z.array(customInputSchema).max(20).optional().default([]),
});

const invoiceReceiverSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  address: z.string().max(200).optional().default(""),
  city: z.string().max(100).optional().default(""),
  zipCode: z.string().max(20).optional().default(""),
  country: z.string().max(100).optional().default(""),
  email: z.string().email("Invalid email").or(z.literal("")),
  phone: z.string().max(50).optional().default(""),
  customInputs: z.array(customInputSchema).max(20).optional().default([]),
});

const invoiceItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Item name is required").max(200),
  description: z.string().max(5000).optional().default(""),
  quantity: z.number().min(0.01, "Quantity must be > 0"),
  unitPrice: z.number().min(0, "Price must be >= 0"),
  total: z.number(),
});

export const invoiceDataSchema = z.object({
  sender: invoiceSenderSchema,
  receiver: invoiceReceiverSchema,
  details: z.object({
    invoiceLogo: z.string().max(700_000),
    invoiceNumber: z.string().min(1, "Invoice number is required").max(50),
    invoiceDate: z.string().min(1, "Invoice date is required"),
    dueDate: z.string(),
    terms: z.string().max(200),
    currency: z.string().min(1),
    themeColor: z.string(),
    templateNumber: z.number(),
    items: z.array(invoiceItemSchema).min(1, "At least one item is required").max(100),
    discountDetails: z
      .object({
        amount: z.number().min(0),
        amountType: z.enum(["amount", "percentage"]),
      })
      .nullable(),
    taxDetails: z
      .object({
        amount: z.number().min(0),
        taxId: z.string(),
        amountType: z.enum(["amount", "percentage"]),
      })
      .nullable(),
    shippingDetails: z
      .object({
        cost: z.number().min(0),
        costType: z.enum(["amount", "percentage"]),
      })
      .nullable(),
    paymentInfo: z
      .object({
        bankName: z.string(),
        accountName: z.string(),
        accountNumber: z.string(),
      })
      .nullable(),
    additionalNotes: z.string().max(2000),
    noteToCustomer: z.string().max(2000),
    paymentTerms: z.string().max(2000),
    signature: z
      .object({
        type: z.enum(["draw", "type", "upload"]),
        data: z.string(),
        fontFamily: z.string().optional(),
        color: z.string().optional(),
      })
      .nullable(),
    totalInWords: z.boolean(),
    subTotal: z.number(),
    totalAmount: z.number(),
  }),
});

// ── Constants ───────────────────────────────────────────────────────

export const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
] as const;

export const THEME_COLORS = [
  { name: "blue", label: "Blue", color: "#2563eb" },
  { name: "indigo", label: "Indigo", color: "#4f46e5" },
  { name: "violet", label: "Violet", color: "#7c3aed" },
  { name: "emerald", label: "Emerald", color: "#059669" },
  { name: "teal", label: "Teal", color: "#0d9488" },
  { name: "rose", label: "Rose", color: "#e11d48" },
  { name: "amber", label: "Amber", color: "#d97706" },
  { name: "slate", label: "Slate", color: "#475569" },
] as const;

export const SIGNATURE_FONTS = [
  { name: "Dancing Script", label: "Dancing Script" },
  { name: "Parisienne", label: "Parisienne" },
  { name: "Great Vibes", label: "Great Vibes" },
  { name: "Alex Brush", label: "Alex Brush" },
] as const;

export const SIGNATURE_COLORS = [
  { name: "black", label: "Black", color: "#000000" },
  { name: "darkBlue", label: "Dark Blue", color: "#000080" },
  { name: "crimson", label: "Crimson", color: "#DC143C" },
] as const;

export function createEmptyItem(): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    total: 0,
  };
}

/** Client-side fallback — real values loaded from DB via /api/agency-config */
export const INITIAL_INVOICE_DATA: InvoiceData = {
  sender: {
    name: "",
    address: "",
    city: "",
    zipCode: "",
    country: "",
    email: "",
    phone: "",
    customInputs: [],
  },
  receiver: {
    name: "",
    address: "",
    city: "",
    zipCode: "",
    country: "",
    email: "",
    phone: "",
    customInputs: [],
  },
  details: {
    invoiceLogo: "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    terms: "Due on receipt",
    currency: "USD",
    themeColor: "#2563eb",
    templateNumber: 1,
    items: [createEmptyItem()],
    discountDetails: null,
    taxDetails: null,
    shippingDetails: null,
    paymentInfo: null,
    additionalNotes: "",
    noteToCustomer: "",
    paymentTerms: "",
    signature: null,
    totalInWords: false,
    subTotal: 0,
    totalAmount: 0,
  },
};

// ── Helpers ─────────────────────────────────────────────────────────

export function calculateTotals(
  items: InvoiceItem[],
  discount: { amount: number; amountType: "amount" | "percentage" } | null,
  tax: { amount: number; amountType: "amount" | "percentage" } | null,
  shipping: { cost: number; costType: "amount" | "percentage" } | null
): { subTotal: number; totalAmount: number } {
  const subTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  let total = subTotal;

  if (discount) {
    const discountValue =
      discount.amountType === "percentage"
        ? subTotal * (discount.amount / 100)
        : discount.amount;
    total -= discountValue;
  }

  if (tax) {
    const taxValue =
      tax.amountType === "percentage"
        ? subTotal * (tax.amount / 100)
        : tax.amount;
    total += taxValue;
  }

  if (shipping) {
    const shippingValue =
      shipping.costType === "percentage"
        ? subTotal * (shipping.cost / 100)
        : shipping.cost;
    total += shippingValue;
  }

  return {
    subTotal: Math.round(subTotal * 100) / 100,
    totalAmount: Math.max(0, Math.round(total * 100) / 100),
  };
}

export function formatCurrencyValue(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function getCurrencySymbol(code: string): string {
  const currency = CURRENCIES.find((c) => c.code === code);
  return currency?.symbol ?? code;
}

// ── Draft persistence ───────────────────────────────────────────────

const DRAFT_KEY = "ac:invoiceDraft";
const SAVED_KEY = "ac:savedInvoices";

export function saveDraft(data: InvoiceData): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

export function loadDraft(): InvoiceData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as InvoiceData;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

// ── Saved invoices ──────────────────────────────────────────────────

export function getSavedInvoices(): SavedInvoice[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedInvoice[];
  } catch {
    return [];
  }
}

export function saveInvoice(data: InvoiceData): SavedInvoice {
  const invoices = getSavedInvoices();
  const entry: SavedInvoice = {
    id: crypto.randomUUID(),
    label: data.details.invoiceNumber || "Untitled",
    senderName: data.sender.name || "Unknown",
    receiverName: data.receiver.name || "Unknown",
    totalAmount: data.details.totalAmount,
    currency: data.details.currency,
    savedAt: new Date().toISOString(),
    data,
  };
  invoices.unshift(entry);
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(invoices));
  } catch {
    // full
  }
  return entry;
}

export function deleteSavedInvoice(id: string): void {
  const invoices = getSavedInvoices().filter((inv) => inv.id !== id);
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(invoices));
  } catch {
    // ignore
  }
}

// ── Export helpers ───────────────────────────────────────────────────

export function exportAsJson(data: InvoiceData): Blob {
  return new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
}

export function exportAsCsv(data: InvoiceData): Blob {
  const rows: string[][] = [];
  // Header
  rows.push(["Field", "Value"]);
  rows.push(["Invoice Number", data.details.invoiceNumber]);
  rows.push(["Invoice Date", data.details.invoiceDate]);
  rows.push(["Due Date", data.details.dueDate]);
  rows.push(["Currency", data.details.currency]);
  rows.push(["Sender Name", data.sender.name]);
  rows.push(["Sender Email", data.sender.email]);
  rows.push(["Sender Address", [data.sender.address, data.sender.city, data.sender.zipCode, data.sender.country].filter(Boolean).join(", ")]);
  rows.push(["Receiver Name", data.receiver.name]);
  rows.push(["Receiver Email", data.receiver.email]);
  rows.push(["Receiver Address", [data.receiver.address, data.receiver.city, data.receiver.zipCode, data.receiver.country].filter(Boolean).join(", ")]);
  rows.push([]);
  rows.push(["Item", "Description", "Quantity", "Unit Price", "Total"]);
  for (const item of data.details.items) {
    rows.push([
      item.name,
      item.description,
      String(item.quantity),
      String(item.unitPrice),
      String(item.quantity * item.unitPrice),
    ]);
  }
  rows.push([]);
  rows.push(["Subtotal", String(data.details.subTotal)]);
  rows.push(["Total", String(data.details.totalAmount)]);

  // Sanitize cells to prevent CSV formula injection
  const sanitize = (val: string): string => {
    const s = String(val).replace(/"/g, '""');
    // Prefix formula-triggering characters with a single quote
    if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
    return s;
  };

  const csv = rows
    .map((row) => row.map((cell) => `"${sanitize(cell)}"`).join(","))
    .join("\n");

  return new Blob([csv], { type: "text/csv" });
}

export function exportAsXml(data: InvoiceData): Blob {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<invoice>\n';
  xml += `  <invoiceNumber>${esc(data.details.invoiceNumber)}</invoiceNumber>\n`;
  xml += `  <invoiceDate>${esc(data.details.invoiceDate)}</invoiceDate>\n`;
  xml += `  <dueDate>${esc(data.details.dueDate)}</dueDate>\n`;
  xml += `  <currency>${esc(data.details.currency)}</currency>\n`;
  xml += `  <sender>\n`;
  xml += `    <name>${esc(data.sender.name)}</name>\n`;
  xml += `    <email>${esc(data.sender.email)}</email>\n`;
  xml += `    <phone>${esc(data.sender.phone)}</phone>\n`;
  xml += `    <address>${esc(data.sender.address)}</address>\n`;
  xml += `    <city>${esc(data.sender.city)}</city>\n`;
  xml += `    <zipCode>${esc(data.sender.zipCode)}</zipCode>\n`;
  xml += `    <country>${esc(data.sender.country)}</country>\n`;
  for (const ci of data.sender.customInputs) {
    xml += `    <customField><key>${esc(ci.key)}</key><value>${esc(ci.value)}</value></customField>\n`;
  }
  xml += `  </sender>\n`;
  xml += `  <receiver>\n`;
  xml += `    <name>${esc(data.receiver.name)}</name>\n`;
  xml += `    <email>${esc(data.receiver.email)}</email>\n`;
  xml += `    <phone>${esc(data.receiver.phone)}</phone>\n`;
  xml += `    <address>${esc(data.receiver.address)}</address>\n`;
  xml += `    <city>${esc(data.receiver.city)}</city>\n`;
  xml += `    <zipCode>${esc(data.receiver.zipCode)}</zipCode>\n`;
  xml += `    <country>${esc(data.receiver.country)}</country>\n`;
  for (const ci of data.receiver.customInputs) {
    xml += `    <customField><key>${esc(ci.key)}</key><value>${esc(ci.value)}</value></customField>\n`;
  }
  xml += `  </receiver>\n`;
  xml += `  <items>\n`;
  for (const item of data.details.items) {
    xml += `    <item>\n`;
    xml += `      <name>${esc(item.name)}</name>\n`;
    xml += `      <description>${esc(item.description)}</description>\n`;
    xml += `      <quantity>${item.quantity}</quantity>\n`;
    xml += `      <unitPrice>${item.unitPrice}</unitPrice>\n`;
    xml += `      <total>${item.quantity * item.unitPrice}</total>\n`;
    xml += `    </item>\n`;
  }
  xml += `  </items>\n`;
  xml += `  <subTotal>${data.details.subTotal}</subTotal>\n`;
  xml += `  <totalAmount>${data.details.totalAmount}</totalAmount>\n`;
  if (data.details.additionalNotes) {
    xml += `  <additionalNotes>${esc(data.details.additionalNotes)}</additionalNotes>\n`;
  }
  xml += `</invoice>\n`;

  return new Blob([xml], { type: "application/xml" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
