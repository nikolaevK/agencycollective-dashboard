export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireDealReviewer } from "@/lib/api/dealDraftActor";
import {
  DEAL_PREP_PLAYBOOK_MAX_LENGTH,
  getDealPrepPlaybook,
  resetDealPrepPlaybook,
  setDealPrepPlaybook,
} from "@/lib/dealPrepPlaybook";
import { exemplarCount } from "@/lib/dealPrepExemplars";
import { isDealPrepAutoRun, listDealPreps } from "@/lib/dealPrep";
import { logAuditEvent } from "@/lib/auditLog";

async function payload() {
  const [playbook, exemplars, awaiting] = await Promise.all([
    getDealPrepPlaybook(),
    exemplarCount(),
    listDealPreps({ status: "queued", limit: 0, offset: 0 }),
  ]);
  return { ...playbook, autoRun: isDealPrepAutoRun(), awaiting: awaiting.total, exemplars };
}

/** The deal-prep agent's playbook + learning status. */
export async function GET() {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;
  return NextResponse.json({ data: await payload() });
}

/** Save the playbook: { text }. */
export async function PUT(request: Request) {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;

  const body = await request.json().catch(() => null);
  const text = body && typeof body.text === "string" ? body.text : null;
  if (text === null || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > DEAL_PREP_PLAYBOOK_MAX_LENGTH) {
    return NextResponse.json({ error: `At most ${DEAL_PREP_PLAYBOOK_MAX_LENGTH} characters` }, { status: 400 });
  }
  await setDealPrepPlaybook(text);
  logAuditEvent({
    adminId: guard.admin.id,
    adminUsername: guard.admin.username,
    action: "deal_prep.playbook_update",
    targetType: "agency_config",
    targetId: "deal_prep_playbook",
  }).catch(() => {});
  return NextResponse.json({ data: await payload() });
}

/** Back to the built-in default playbook. */
export async function DELETE() {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;
  await resetDealPrepPlaybook();
  logAuditEvent({
    adminId: guard.admin.id,
    adminUsername: guard.admin.username,
    action: "deal_prep.playbook_reset",
    targetType: "agency_config",
    targetId: "deal_prep_playbook",
  }).catch(() => {});
  return NextResponse.json({ data: await payload() });
}
