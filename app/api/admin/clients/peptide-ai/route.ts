export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { readUsers } from "@/lib/users";
import { inWorkspaceScope } from "@/lib/workspaces";
import { requireDirectoryActor } from "@/lib/api/requireAdmin";
import {
  disableDeletedPeptideAiClients,
  getPeptideAiPolicies,
  isPeptideAiConfigured,
  readAndReconcilePeptideAi,
} from "@/lib/peptideAi";
import { peptideAiState, type PeptideAiUsage } from "@/lib/peptideAiPresentation";

/**
 * Peptide AI usage across the actor's clients: policy, spend this cycle and a
 * state (never opened / near limit / limit reached / …) per client. Loading it
 * is also the catch-up for pushes that were missed: any client Peptide AI is
 * out of step with gets its policy pushed, and (for unscoped admins, who see
 * every book) deleted clients still marked are switched off there.
 */
export async function GET() {
  await ensureMigrated();
  const actor = await requireDirectoryActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = (await readUsers()).filter((u) => inWorkspaceScope(actor.scope, u.workspace));
  const policies = await getPeptideAiPolicies(users);
  const configured = isPeptideAiConfigured();

  let usage = new Map<string, PeptideAiUsage>();
  let reachable = configured;
  if (configured) {
    try {
      usage = await readAndReconcilePeptideAi([...policies.values()], 15_000);
      if (actor.scope === null) {
        await disableDeletedPeptideAiClients().catch((err) =>
          console.error("[peptideAi] switching off deleted clients failed:", err instanceof Error ? err.message : err)
        );
      }
    } catch (err) {
      console.error("[peptideAi] usage overview sync failed:", err instanceof Error ? err.message : err);
      reachable = false;
    }
  }

  const rows = users.map((u) => {
    const policy = policies.get(u.id)!;
    const clientUsage = reachable ? (usage.get(u.id) ?? null) : null;
    return {
      userId: u.id,
      displayName: u.displayName,
      workspace: u.workspace,
      policy,
      usage: clientUsage,
      state: peptideAiState(policy.enabled, clientUsage),
    };
  });

  return NextResponse.json({ data: { configured, reachable, rows } });
}
