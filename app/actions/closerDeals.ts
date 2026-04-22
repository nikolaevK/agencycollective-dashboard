"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { getCloserSession } from "@/lib/closerSession";
import { findDeal, insertDeal, updateDeal, deleteDeal, sanitizeCcEmails } from "@/lib/deals";
import { ensureMigrated } from "@/lib/db";
import type { DealStatus } from "@/lib/deals";
import { setEventAttendance } from "@/lib/eventAttendance";
import { generateInvoiceFromDeal } from "@/lib/dealInvoiceGenerator";
import { insertDealInvoice, generateInvoiceNumber } from "@/lib/dealInvoices";
import { findTemplateForServices } from "@/lib/contractTemplates";
import { insertDealContract } from "@/lib/dealContracts";
import { parseServiceCategory } from "@/lib/serviceCategory";
import { sendPushToAllAdmins } from "@/lib/pushNotifications";

const VALID_STATUSES: DealStatus[] = ["closed", "not_closed", "pending_signature", "rescheduled", "follow_up"];

export async function createDealAction(formData: FormData): Promise<{ error?: string }> {
  const session = getCloserSession();
  if (!session) return { error: "Unauthorized" };

  await ensureMigrated();

  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientUserId = String(formData.get("clientUserId") ?? "").trim() || null;
  const dealValueStr = String(formData.get("dealValue") ?? "0").trim();
  const serviceCategory = String(formData.get("serviceCategory") ?? "").trim() || null;
  const industry = String(formData.get("industry") ?? "").trim() || null;
  const closingDate = String(formData.get("closingDate") ?? "").trim() || null;
  const status = (String(formData.get("status") ?? "follow_up").trim()) as DealStatus;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const googleEventId = String(formData.get("googleEventId") ?? "").trim() || null;

  if (!clientName) {
    return { error: "Client name is required" };
  }

  if (!VALID_STATUSES.includes(status)) {
    return { error: "Invalid status" };
  }

  const dealValueDollars = parseFloat(dealValueStr) || 0;
  if (status !== "not_closed" && dealValueDollars <= 0) {
    return { error: "Deal value must be greater than 0" };
  }
  const dealValue = Math.round(dealValueDollars * 100);

  const id = crypto.randomUUID();

  const rawEmail = String(formData.get("clientEmail") ?? "").trim();
  const clientEmail = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) && rawEmail.length <= 254 ? rawEmail : null;
  const paymentType = String(formData.get("paymentType") ?? "local").trim() || "local";
  const brandName = String(formData.get("brandName") ?? "").trim() || null;
  const website = String(formData.get("website") ?? "").trim() || null;
  const additionalCcEmails = sanitizeCcEmails(formData.getAll("additionalCcEmails"));

  await insertDeal({
    id,
    closerId: session.closerId,
    clientName,
    clientUserId,
    clientEmail,
    dealValue,
    serviceCategory,
    industry,
    closingDate,
    status,
    showStatus: (status === "closed" && googleEventId) ? "showed" : (String(formData.get("showStatus") ?? "").trim() || null) as "showed" | "no_show" | null,
    notes,
    googleEventId,
    paymentType,
    brandName,
    website,
    paidStatus: "unpaid",
    additionalCcEmails,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Auto-set attendance when deal is closed and linked to calendar event
  if (status === "closed" && googleEventId) {
    await setEventAttendance(googleEventId, session.closerId, "showed");
  }

  // Auto-generate invoice for closed deals
  if (status === "closed" && dealValue > 0) {
    try {
      const invoiceNumber = await generateInvoiceNumber();
      const deal = { id, closerId: session.closerId, clientName, clientUserId, clientEmail, dealValue, serviceCategory, industry, closingDate, status, showStatus: null as "showed" | "no_show" | null, notes, googleEventId, paymentType, brandName, website, paidStatus: "unpaid" as const, additionalCcEmails, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const invoiceData = await generateInvoiceFromDeal(deal, clientEmail, invoiceNumber);
      await insertDealInvoice({
        id: crypto.randomUUID(),
        dealId: id,
        invoiceNumber,
        invoiceData: JSON.stringify(invoiceData),
        clientEmail,
        createdBy: session.closerId,
      });
    } catch (err) {
      console.error("[createDealAction] Invoice generation failed:", err instanceof Error ? err.message : err);
      // Don't fail deal creation if invoice generation fails
    }
  }

  // Prepare contract record for closed deals with email (NOT sent yet — admin sends with invoice)
  if (status === "closed" && dealValue > 0 && clientEmail) {
    try {
      const serviceKeys = parseServiceCategory(serviceCategory);
      const template = await findTemplateForServices(serviceKeys);
      if (template) {
        await insertDealContract({
          id: crypto.randomUUID(),
          dealId: id,
          contractTemplateId: template.id,
          status: "pending",
          clientEmail,
          createdBy: session.closerId,
        });
      }
    } catch (err) {
      console.error("[createDealAction] Contract record creation failed:", err instanceof Error ? err.message : err);
    }
  }

  revalidatePath("/closer/dashboard");

  // Send push notification to admins — awaited so it completes before response
  try {
    await sendPushToAllAdmins({
      title: `New Deal: ${clientName}`,
      body: `${status === "closed" ? "Closed" : "New"} deal worth $${dealValueDollars.toLocaleString()} needs review`,
      url: "/dashboard/closers/deals",
      tag: `deal-${id}`,
    });
  } catch (err) {
    console.error("[createDealAction] Push failed:", err);
  }

  return {};
}

export async function updateDealAction(formData: FormData): Promise<{ error?: string }> {
  const session = getCloserSession();
  if (!session) return { error: "Unauthorized" };

  await ensureMigrated();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Deal ID is required" };

  const deal = await findDeal(id);
  if (!deal || deal.closerId !== session.closerId) {
    return { error: "Deal not found" };
  }

  const changes: Parameters<typeof updateDeal>[1] = {};

  const clientName = formData.get("clientName") as string | null;
  if (clientName && clientName.trim()) {
    changes.clientName = clientName.trim();
  }

  const clientUserId = formData.get("clientUserId") as string | null;
  if (clientUserId !== null) {
    changes.clientUserId = clientUserId.trim() || null;
  }

  const dealValueStr = formData.get("dealValue") as string | null;
  if (dealValueStr !== null) {
    const dealValueDollars = parseFloat(dealValueStr) || 0;
    changes.dealValue = Math.round(dealValueDollars * 100);
  }

  const serviceCategory = formData.get("serviceCategory") as string | null;
  if (serviceCategory !== null) {
    changes.serviceCategory = serviceCategory.trim() || null;
  }

  const industry = formData.get("industry") as string | null;
  if (industry !== null) {
    changes.industry = industry.trim() || null;
  }

  const closingDate = formData.get("closingDate") as string | null;
  if (closingDate !== null) {
    changes.closingDate = closingDate.trim() || null;
  }

  const status = formData.get("status") as string | null;
  if (status && VALID_STATUSES.includes(status as DealStatus)) {
    changes.status = status as DealStatus;
  }

  const notes = formData.get("notes") as string | null;
  if (notes !== null) {
    changes.notes = notes.trim() || null;
  }

  if (formData.has("additionalCcEmails")) {
    changes.additionalCcEmails = sanitizeCcEmails(formData.getAll("additionalCcEmails"));
  }

  await updateDeal(id, changes);

  revalidatePath("/closer/dashboard");
  return {};
}

export async function deleteDealAction(id: string): Promise<{ error?: string }> {
  const session = getCloserSession();
  if (!session) return { error: "Unauthorized" };

  await ensureMigrated();

  const deal = await findDeal(id);
  if (!deal || deal.closerId !== session.closerId) {
    return { error: "Deal not found" };
  }

  const deleted = await deleteDeal(id);
  if (!deleted) return { error: "Failed to delete" };

  revalidatePath("/closer/dashboard");
  return {};
}
