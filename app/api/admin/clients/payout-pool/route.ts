export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getPayoutPool } from "@/lib/clientDirectory";
import { requireInternalActor } from "@/lib/api/requireAdmin";

/**
 * Payout-DB brands not yet linked to a client, for the "add client from the
 * Payout DB" picker. `since`/`until` (yyyy-mm-dd) filter by the brand's
 * date_joined; the UI defaults to the past week and lets the admin widen it.
 *
 * INTERNAL ONLY: the pool lists every unclaimed brand in the Payout DB —
 * external (partner) scopes never see it.
 */
export async function GET(request: Request) {
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;

  await ensureMigrated();

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  const pool = await getPayoutPool({ since, until });
  return NextResponse.json({ data: pool });
}
