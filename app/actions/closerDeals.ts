"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { getCloserSession } from "@/lib/closerSession";
import { findDeal, insertDeal, updateDeal, deleteDeal } from "@/lib/deals";
import { ensureMigrated } from "@/lib/db";
import type { DealStatus } from "@/lib/deals";
import { setEventAttendance } from "@/lib/eventAttendance";

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

  await insertDeal({
    id,
    closerId: session.closerId,
    clientName,
    clientUserId,
    dealValue,
    serviceCategory,
    industry,
    closingDate,
    status,
    showStatus: (status === "closed" && googleEventId) ? "showed" : (String(formData.get("showStatus") ?? "").trim() || null) as "showed" | "no_show" | null,
    notes,
    googleEventId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Auto-set attendance when deal is closed and linked to calendar event
  if (status === "closed" && googleEventId) {
    await setEventAttendance(googleEventId, session.closerId, "showed");
  }

  revalidatePath("/closer/dashboard");
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
