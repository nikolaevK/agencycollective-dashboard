export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { buildAdAccountDirectory } from "@/lib/adAccountDirectory";
import { createAdAccount } from "@/lib/adAccounts";
import { findUser } from "@/lib/users";
import { requireAdminRecord as requireAdminSession } from "@/lib/api/requireAdmin";

/** Ad Accounts directory: enriched rows (client, fee, retainer, schedule,
 *  reconciled latest invoice) + summary counts. Mirrors /api/admin/users. */
export async function GET() {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();
  const { rows, summary } = await buildAdAccountDirectory();
  return NextResponse.json({ data: { rows, summary } });
}

/** Create an ad account, optionally attached to a client. */
export async function POST(request: Request) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
  if (!accountName)
    return NextResponse.json({ error: "accountName is required" }, { status: 400 });

  // Validate optional client link.
  let userId: string | null = null;
  if (typeof body.userId === "string" && body.userId) {
    const user = await findUser(body.userId);
    if (!user)
      return NextResponse.json({ error: "Client not found" }, { status: 400 });
    userId = user.id;
  }

  const account = await createAdAccount({
    userId,
    accountName,
    vendor: typeof body.vendor === "string" ? body.vendor : null,
    platform: typeof body.platform === "string" ? body.platform : null,
    adSpendFeeBps:
      typeof body.adSpendFeeBps === "number" ? body.adSpendFeeBps : undefined,
    monthlyRetainerCents:
      typeof body.monthlyRetainerCents === "number"
        ? body.monthlyRetainerCents
        : undefined,
    status: body.status === "inactive" ? "inactive" : "active",
    notes: typeof body.notes === "string" ? body.notes : null,
    billingPaused: typeof body.billingPaused === "boolean" ? body.billingPaused : undefined,
    billingDay:
      typeof body.billingDay === "number" ? body.billingDay : body.billingDay === null ? null : undefined,
    leadDays: typeof body.leadDays === "number" ? body.leadDays : undefined,
    extendUntil:
      typeof body.extendUntil === "string" ? body.extendUntil : body.extendUntil === null ? null : undefined,
    lastBilledOverride:
      typeof body.lastBilledOverride === "string"
        ? body.lastBilledOverride
        : body.lastBilledOverride === null
        ? null
        : undefined,
  });

  return NextResponse.json({ data: account });
}
