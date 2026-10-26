export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { isExternalScope } from "@/lib/workspaces";
import { logAuditEvent } from "@/lib/auditLog";
import {
  getPeptideAiPolicy,
  getPeptideAiSetting,
  isPeptideAiConfigured,
  pushPeptideAiPolicies,
  readAndReconcilePeptideAi,
  setPeptideAiSetting,
  type PeptideAiPolicy,
} from "@/lib/peptideAi";
import type { PeptideAiUsage } from "@/lib/peptideAiPresentation";

interface RouteContext {
  params: { userId: string };
}

/** Usage in Peptide AI; null when it's unreachable or not configured. */
async function usageOf(
  policy: PeptideAiPolicy,
  talk: (p: PeptideAiPolicy[]) => Promise<Map<string, PeptideAiUsage>>
): Promise<PeptideAiUsage | null> {
  if (!isPeptideAiConfigured()) return null;
  try {
    return (await talk([policy])).get(policy.clientId) ?? null;
  } catch (err) {
    console.error("[peptideAi] admin sync failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** One client's Peptide AI switch, budget override, effective policy and usage. */
export async function GET(_request: Request, { params }: RouteContext) {
  await ensureMigrated();
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

  const policy = await getPeptideAiPolicy(guard.user);
  const setting = await getPeptideAiSetting(params.userId);
  return NextResponse.json({
    data: {
      configured: isPeptideAiConfigured(),
      setting: { enabled: setting.enabled, capCents: setting.capCents },
      policy,
      usage: await usageOf(policy, (p) => readAndReconcilePeptideAi(p, 6_000)),
    },
  });
}

/**
 * Body: { enabled: boolean, capCents?: number | null } — capCents null = the
 * default budget, absent = keep the current one. Applied in Peptide AI straight
 * away (the response carries the fresh usage), including mid-session: a lowered
 * budget or a switch-off binds on the client's next request there. Internal
 * admins only — the budget is Agency Collective's spend, so partner-book admins
 * can see it but not change it.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  await ensureMigrated();
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  if (isExternalScope(guard.actor.scope)) {
    return NextResponse.json({ error: "Peptide AI access is managed by the agency" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { enabled?: unknown; capCents?: unknown } | null;
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }
  const before = await getPeptideAiSetting(params.userId);
  const capCents = body.capCents === undefined ? before.capCents : body.capCents;
  // At least $1: zero would read as "no limit" to Peptide AI's spend gate.
  if (capCents !== null && (!Number.isInteger(capCents) || (capCents as number) < 100 || (capCents as number) > 1_000_000)) {
    return NextResponse.json(
      { error: "capCents must be whole cents between 100 ($1) and 1,000,000 ($10,000), or null" },
      { status: 400 }
    );
  }

  const setting = { enabled: body.enabled, capCents: capCents as number | null };
  await setPeptideAiSetting(params.userId, setting);

  logAuditEvent({
    adminId: guard.actor.admin.id,
    adminUsername: guard.actor.admin.username,
    action: "client.peptide_ai_update",
    targetType: "client",
    targetId: params.userId,
    details: JSON.stringify({ before: { enabled: before.enabled, capCents: before.capCents }, after: setting }),
  }).catch(() => {});

  const policy = await getPeptideAiPolicy(guard.user);
  return NextResponse.json({
    data: {
      configured: isPeptideAiConfigured(),
      setting,
      policy,
      usage: await usageOf(policy, (p) => pushPeptideAiPolicies(p, 6_000)),
    },
  });
}
