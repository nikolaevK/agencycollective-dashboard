"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { getCloserOnlyFromSession } from "@/lib/closerGuards";
import { findDeal, insertDeal, updateDeal, deleteDeal, findDealByCloserAndEvent, sanitizeCcEmails } from "@/lib/deals";
import { ensureMigrated } from "@/lib/db";
import type { DealStatus } from "@/lib/deals";
import { setEventAttendance } from "@/lib/eventAttendance";
import { bestEffortPushAttendanceToGhl } from "@/lib/attendanceSync";
import { bestEffortSyncShowedDidntClose } from "@/lib/ghlCrmSync";
import { resolveSetterForEvent } from "@/lib/setterAttribution";
import { generateInvoiceFromDeal } from "@/lib/dealInvoiceGenerator";
import { insertDealInvoice, generateInvoiceNumber } from "@/lib/dealInvoices";
import { findTemplateForServices } from "@/lib/contractTemplates";
import { insertDealContract } from "@/lib/dealContracts";
import { parseServiceCategory } from "@/lib/serviceCategory";
import { sendPushToAllAdmins } from "@/lib/pushNotifications";

const VALID_STATUSES: DealStatus[] = ["closed", "not_closed", "pending_signature", "rescheduled", "follow_up"];

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Stored dates feed string-comparison window filters — only accept a real
 *  YYYY-MM-DD (or empty). */
function isValidDateOrEmpty(value: string | null): boolean {
  return !value || (YMD_RE.test(value) && !Number.isNaN(Date.parse(value)));
}

/** Server actions are directly invocable, so the closers-only page gate is
 *  not enough — a setter session (shared c_sess) must not create/mutate
 *  closer-attributed deals, and a deactivated row must be rejected. */
async function requireCloserForDeals(): Promise<{ closerId: string } | null> {
  const closer = await getCloserOnlyFromSession();
  return closer ? { closerId: closer.id } : null;
}

export async function createDealAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireCloserForDeals();
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
  if (!Number.isFinite(dealValueDollars) || dealValueDollars < 0 || dealValueDollars > 10_000_000) {
    return { error: "Invalid deal value" };
  }
  if (status !== "not_closed" && dealValueDollars <= 0) {
    return { error: "Deal value must be greater than 0" };
  }
  const dealValue = Math.round(dealValueDollars * 100);

  if (!isValidDateOrEmpty(closingDate)) {
    return { error: "Invalid closing date" };
  }

  // One deal per (closer, event): a double-submit or a retry after a failed
  // post-insert side effect otherwise duplicates the deal and its invoice.
  if (googleEventId) {
    const existing = await findDealByCloserAndEvent(session.closerId, googleEventId);
    if (existing) {
      return { error: "You already have a deal linked to this event." };
    }
  }

  const id = crypto.randomUUID();

  const rawEmail = String(formData.get("clientEmail") ?? "").trim();
  const clientEmail = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) && rawEmail.length <= 254 ? rawEmail : null;
  const paymentType = String(formData.get("paymentType") ?? "local").trim() || "local";
  const brandName = String(formData.get("brandName") ?? "").trim() || null;
  const website = String(formData.get("website") ?? "").trim() || null;
  const additionalCcEmails = sanitizeCcEmails(formData.getAll("additionalCcEmails"));

  // Setter is only attributed when they've claimed AND picked a tier per
  // the 1099 contract. `resolveSetterForEvent` returns null until the
  // setter's appointment carries a tier letter.
  const resolvedSetter = googleEventId ? await resolveSetterForEvent(googleEventId) : null;
  const setterId = resolvedSetter?.setterId ?? null;
  const setterTier = resolvedSetter?.tier ?? null;

  await insertDeal({
    id,
    closerId: session.closerId,
    setterId,
    setterTier,
    noRetainer: false,
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
    setterOverride: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Auto-set attendance when deal is closed and linked to calendar event.
  // Best-effort and parallel: the deal is already inserted, so a failed
  // attendance/GHL round-trip must not fail the action (the resulting user
  // retry is what used to create duplicate deals).
  if (status === "closed" && googleEventId) {
    try {
      await setEventAttendance(googleEventId, session.closerId, "showed");
    } catch (err) {
      console.error("[createDealAction] attendance write failed:", err);
    }
    // Push to GHL if this event is linked. No coords on hand here, so
    // first-sight resolution can't run — drift detection on the next
    // calendar read covers that case.
    await Promise.allSettled([
      bestEffortPushAttendanceToGhl({
        googleEventId,
        dashboardStatus: "showed",
      }),
      // Advance the GHL lead to "Showed didn't close" (tag + pipeline stage).
      bestEffortSyncShowedDidntClose({
        googleEventId,
        leadName: clientName,
      }),
    ]);
  }

  // Auto-generate invoice for closed deals
  if (status === "closed" && dealValue > 0) {
    try {
      const invoiceNumber = await generateInvoiceNumber();
      const deal = { id, closerId: session.closerId, setterId, clientName, clientUserId, clientEmail, dealValue, serviceCategory, industry, closingDate, status, showStatus: null as "showed" | "no_show" | null, notes, googleEventId, paymentType, brandName, website, paidStatus: "unpaid" as const, additionalCcEmails, setterTier, noRetainer: false, setterOverride: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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

  // Notify admins only when the deal is closed and lands in their queue
  // for invoice review. In-flight statuses (rescheduled, follow_up,
  // not_closed) stay with the closer per project policy — pinging admin
  // about a deal they can't see and didn't action would just be noise.
  if (status === "closed") {
    try {
      await sendPushToAllAdmins({
        title: `New Deal: ${clientName}`,
        body: `Closed deal worth $${dealValueDollars.toLocaleString()} needs review`,
        url: "/dashboard/closers/deals",
        tag: `deal-${id}`,
      });
    } catch (err) {
      console.error("[createDealAction] Push failed:", err);
    }
  }

  return {};
}

export async function updateDealAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireCloserForDeals();
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
    if (!Number.isFinite(dealValueDollars) || dealValueDollars < 0 || dealValueDollars > 10_000_000) {
      return { error: "Invalid deal value" };
    }
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
    const cd = closingDate.trim() || null;
    if (!isValidDateOrEmpty(cd)) {
      return { error: "Invalid closing date" };
    }
    changes.closingDate = cd;
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
  const session = await requireCloserForDeals();
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
