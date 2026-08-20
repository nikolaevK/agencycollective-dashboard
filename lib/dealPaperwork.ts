import crypto from "crypto";
import type { DealRecord } from "./deals";
import { generateInvoiceFromDeal } from "./dealInvoiceGenerator";
import { insertDealInvoice, generateInvoiceNumber, findDealInvoiceByDealId } from "./dealInvoices";
import { findDealContractByDealId, insertDealContract } from "./dealContracts";
import { findTemplateForServices } from "./contractTemplates";
import { parseServiceCategory } from "./serviceCategory";

/**
 * Backfill the invoice + contract records a closed deal is expected to carry.
 *
 * createDealAction auto-generates these only when a deal is CREATED already
 * closed — a deal created in-flight (follow_up/rescheduled) and later flipped
 * to closed skipped that step, so the admin table had no invoice/contract
 * badge and therefore no review drawer to create/send from. Called from every
 * status-update path on a transition to closed.
 *
 * Idempotent (existing records are never touched, so re-saving a closed deal
 * is safe and also heals older stuck deals) and best-effort: a failed
 * generation must never fail the status update that triggered it.
 */
export async function ensureDealPaperwork(
  deal: DealRecord,
  createdBy: string | null
): Promise<void> {
  if (deal.status !== "closed" || deal.dealValue <= 0) return;

  try {
    const existingInvoice = await findDealInvoiceByDealId(deal.id);
    if (!existingInvoice) {
      const invoiceNumber = await generateInvoiceNumber();
      const invoiceData = await generateInvoiceFromDeal(deal, deal.clientEmail, invoiceNumber);
      await insertDealInvoice({
        id: crypto.randomUUID(),
        dealId: deal.id,
        invoiceNumber,
        invoiceData: JSON.stringify(invoiceData),
        clientEmail: deal.clientEmail,
        createdBy,
      });
    }
  } catch (err) {
    console.error("[ensureDealPaperwork] Invoice generation failed:", err instanceof Error ? err.message : err);
  }

  // Contract record (NOT sent yet — admin sends with invoice), needs an email
  if (deal.clientEmail) {
    try {
      const existingContract = await findDealContractByDealId(deal.id);
      if (!existingContract) {
        const serviceKeys = parseServiceCategory(deal.serviceCategory);
        const template = await findTemplateForServices(serviceKeys);
        if (template) {
          await insertDealContract({
            id: crypto.randomUUID(),
            dealId: deal.id,
            contractTemplateId: template.id,
            status: "pending",
            clientEmail: deal.clientEmail,
            createdBy,
          });
        }
      }
    } catch (err) {
      console.error("[ensureDealPaperwork] Contract record creation failed:", err instanceof Error ? err.message : err);
    }
  }
}
