export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import {
  getClientProfile,
  getClientTeam,
  upsertClientProfile,
  sanitizeProfileInput,
  defaultClientProfile,
  deriveAdSpendFeeLabel,
} from "@/lib/clientProfile";
import { listAdAccountsForUser } from "@/lib/adAccounts";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";

interface RouteContext {
  params: { userId: string };
}

/** Roster profile + team assignments for one client. */
export async function GET(_request: Request, { params }: RouteContext) {
  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

  const [profile, team, adAccounts] = await Promise.all([
    getClientProfile(params.userId),
    getClientTeam(params.userId),
    listAdAccountsForUser(params.userId),
  ]);

  return NextResponse.json({
    data: {
      profile: profile ?? defaultClientProfile(params.userId),
      team,
      derivedPerfFee: deriveAdSpendFeeLabel(adAccounts),
    },
  });
}

/** Partial update of the roster profile (only provided fields are written). */
export async function PATCH(request: Request, { params }: RouteContext) {
  await ensureMigrated();

  // Don't create an orphan profile row for a non-existent client (libSQL FK
  // enforcement isn't guaranteed); out-of-scope clients read as not-found.
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { input, error } = sanitizeProfileInput(body);
    if (error || !input)
      return NextResponse.json({ error: error ?? "Invalid body" }, { status: 400 });

    await upsertClientProfile(params.userId, input);

    const profile = await getClientProfile(params.userId);
    return NextResponse.json({
      data: { profile: profile ?? defaultClientProfile(params.userId) },
    });
  } catch (err) {
    console.error("[client-profile] PATCH failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
