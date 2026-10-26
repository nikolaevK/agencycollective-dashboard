export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireDealReviewer } from "@/lib/api/dealDraftActor";
import { DealPrepError, findDealPrep, isDealPrepAutoRun, presentDealPrep, rerunDealPrep } from "@/lib/dealPrep";
import { logAuditEvent } from "@/lib/auditLog";

/** The deal's agent prep (summary + flags for the invoice drawer). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;

  const prep = await findDealPrep(params.id);
  return NextResponse.json({ data: { autoRun: isDealPrepAutoRun(), prep: prep ? presentDealPrep(prep) : null } });
}

/** Re-run the agent for this deal (overwrites its draft paperwork): fires the
 *  routine in auto mode, or queues it for the next manual run in Claude. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;

  try {
    const prep = await rerunDealPrep(params.id);
    logAuditEvent({
      adminId: guard.admin.id,
      adminUsername: guard.admin.username,
      action: "deal_prep.rerun",
      targetType: "deal",
      targetId: params.id,
    }).catch(() => {});
    return NextResponse.json({ data: { autoRun: isDealPrepAutoRun(), prep: presentDealPrep(prep) } });
  } catch (err) {
    if (err instanceof DealPrepError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/deals/prep POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
