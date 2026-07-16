export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { findUser } from "@/lib/users";
import {
  getClientProfile,
  getClientTeam,
  upsertClientProfile,
  sanitizeProfileInput,
  defaultClientProfile,
  deriveAdSpendFeeLabel,
} from "@/lib/clientProfile";
import { listAdAccountsForUser } from "@/lib/adAccounts";
import { requireAdminRecord as requireAdminSession } from "@/lib/api/requireAdmin";

interface RouteContext {
  params: { userId: string };
}

/** Roster profile + team assignments for one client. */
export async function GET(_request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const user = await findUser(params.userId);
  if (!user)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

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
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  // Don't create an orphan profile row for a non-existent client (libSQL FK
  // enforcement isn't guaranteed).
  const user = await findUser(params.userId);
  if (!user)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

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
