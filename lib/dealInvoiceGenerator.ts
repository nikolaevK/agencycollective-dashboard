import type { DealRecord } from "./deals";
import type { InvoiceData, InvoiceItem } from "@/types/invoice";
import type { InvoiceServiceRecord } from "./invoiceServices";
import { readInvoiceServices } from "./invoiceServices";
import { parseServiceCategory } from "./serviceCategory";
import { calculateTotals } from "./invoice/validation";
import { getAgencySender, getPaymentTemplate, getDefaultLogo, getDefaultThemeColor } from "./agencyConfig";

/**
 * Generate an InvoiceData object from a closed deal.
 *
 * Matching strategy (in order):
 * 1. Match deal services to presets via deal_service_key
 * 2. For unmatched services, find presets by closest rate to deal value
 * 3. Fall back to custom line items with proportional deal value
 */
export async function generateInvoiceFromDeal(
  deal: DealRecord,
  clientEmail: string | null,
  invoiceNumber: string
): Promise<InvoiceData> {
  const paymentType = (deal.paymentType === "international" ? "international" : "local") as "local" | "international";
  const [services, sender, paymentTemplate, defaultLogo, defaultThemeColor] = await Promise.all([
    readInvoiceServices(),
    getAgencySender(),
    getPaymentTemplate(paymentType),
    getDefaultLogo(),
    getDefaultThemeColor(),
  ]);
  const items = mapServicesToItems(deal, services);

  const { subTotal, totalAmount } = calculateTotals(items, null, null, null);

  return {
    sender,
    receiver: {
      name: deal.clientName,
      address: "",
      city: "",
      zipCode: "",
      country: "",
      email: clientEmail || "",
      phone: "",
      customInputs: [],
    },
    details: {
      invoiceLogo: defaultLogo,
      invoiceNumber,
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

function mapServicesToItems(
  deal: DealRecord,
  presetServices: InvoiceServiceRecord[]
): InvoiceItem[] {
  const dealServices = parseServiceCategory(deal.serviceCategory);
  const dealValueDollars = deal.dealValue / 100;

  // No services selected → try to match by amount
  if (dealServices.length === 0) {
    const match = findBestMatchByAmount(presetServices, dealValueDollars);
    if (match) {
      return [createItemFromPreset(match, dealValueDollars)];
    }
    return [createCustomItem("Professional Services", "", dealValueDollars)];
  }

  // Build lookups: name → preset, dealServiceKey → preset
  const nameToPreset = new Map<string, InvoiceServiceRecord>();
  const keyToPreset = new Map<string, InvoiceServiceRecord>();
  for (const ps of presetServices) {
    nameToPreset.set(ps.name.toLowerCase(), ps);
    if (ps.dealServiceKey) {
      keyToPreset.set(ps.dealServiceKey.toLowerCase(), ps);
    }
  }

  // Resolve each service to a preset (for name/description) or leave unmapped
  const resolved: { name: string; preset: InvoiceServiceRecord | null }[] = [];

  for (const svc of dealServices) {
    const preset =
      nameToPreset.get(svc.toLowerCase()) ??
      keyToPreset.get(svc.toLowerCase()) ??
      null;
    resolved.push({ name: svc, preset });
  }

  // Distribute deal value evenly across all services using integer cents to avoid floating-point drift
  const totalServices = resolved.length;
  const perServiceCents = Math.floor(deal.dealValue / totalServices);
  const remainderCents = deal.dealValue - perServiceCents * totalServices;

  const items: InvoiceItem[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const { name: svcName, preset } = resolved[i];
    // First item absorbs remainder cent(s) so the total matches the deal value exactly
    const cents = perServiceCents + (i === 0 ? remainderCents : 0);
    const unitPrice = cents / 100;

    if (preset) {
      items.push(createItemFromPreset(preset, unitPrice));
    } else {
      const match = findBestMatchByAmount(presetServices, unitPrice);
      if (match) {
        items.push(createItemFromPreset(match, unitPrice));
      } else {
        items.push(createCustomItem(svcName, "", unitPrice));
      }
    }
  }

  return items;
}

/** Find the preset service whose rate is closest to the target amount (within 20% tolerance). */
function findBestMatchByAmount(
  services: InvoiceServiceRecord[],
  targetDollars: number
): InvoiceServiceRecord | null {
  if (targetDollars <= 0 || services.length === 0) return null;

  let best: InvoiceServiceRecord | null = null;
  let bestDiff = Infinity;

  for (const svc of services) {
    const rateDollars = svc.rate / 100;
    const diff = Math.abs(rateDollars - targetDollars);
    const pctDiff = diff / targetDollars;

    if (pctDiff < 0.20 && diff < bestDiff) {
      best = svc;
      bestDiff = diff;
    }
  }

  return best;
}

function createItemFromPreset(preset: InvoiceServiceRecord, unitPrice: number): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    name: preset.name,
    description: preset.description,
    quantity: 1,
    unitPrice,
    total: unitPrice,
  };
}

function createCustomItem(name: string, description: string, unitPrice: number): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    name,
    description,
    quantity: 1,
    unitPrice: Math.round(unitPrice * 100) / 100,
    total: Math.round(unitPrice * 100) / 100,
  };
}
