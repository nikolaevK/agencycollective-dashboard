export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getClientDetail } from "@/lib/clientDirectory";
import { generateClientInvoiceData, generateClientInvoiceNumber } from "@/lib/clientInvoice";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";

interface RouteContext {
  params: { userId: string };
}

/**
 * Prefilled re-bill invoice for a client: agency sender + payment terms (from
 * agency_config) and a line item seeded from the client's payout MRR. The
 * drawer fetches this, the admin adjusts, then sends. `paymentType` swaps the
 * payment-instructions block (local | international).
 */
export async function GET(request: Request, { params }: RouteContext) {
  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

  const detail = await getClientDetail(params.userId);
  if (!detail)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const paymentType = searchParams.get("paymentType") === "international" ? "international" : "local";

  const invoiceNumber = generateClientInvoiceNumber();
  const serviceName = detail.history[0]?.service ?? null;

  const invoiceData = await generateClientInvoiceData({
    clientName: detail.row.displayName,
    clientEmail: detail.row.email,
    amountCents: detail.row.payoutMrr,
    serviceName,
    invoiceNumber,
    paymentType,
  });

  return NextResponse.json({
    data: {
      invoiceData,
      brand: detail.row.matchedBrand ?? detail.row.displayName,
    },
  });
}
