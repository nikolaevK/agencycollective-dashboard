export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireInternalActor, findClientInScope } from "@/lib/api/requireAdmin";
import { payoutBrandBasisForUser } from "@/lib/clientDirectory";
import { listPayoutRowsForBrand } from "@/lib/payouts";

interface RouteContext {
  params: { userId: string };
}

/**
 * Payout rows an admin may link a client's re-bill invoice to (the brand's
 * ledger, newest first). Internal-only — partner scopes never see the
 * Payout DB.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;

  await ensureMigrated();

  const user = await findClientInScope(guard.actor.scope, params.userId);
  if (!user)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const brand = payoutBrandBasisForUser(user);
  const payouts = brand
    ? await listPayoutRowsForBrand(brand, user.workspace !== "main")
    : [];
  return NextResponse.json({ data: { brand, payouts } });
}
