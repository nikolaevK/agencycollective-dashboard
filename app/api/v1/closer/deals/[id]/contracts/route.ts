export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findDealContractByDealId } from "@/lib/dealContracts";
import { findAdditionalContractsByDealId } from "@/lib/dealAdditionalContracts";
import { gateDeal, prepErrorResponse } from "@/lib/api/dealPrepApi";
import { addDealContract, getContractScope } from "@/lib/dealContractScope";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Contract records + statuses for a deal. DocuSeal send/sync excluded. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  const gate = await gateDeal(auth.token, params.id);
  if (gate.error) return gate.error;

  const [primary, additional] = await Promise.all([
    findDealContractByDealId(params.id),
    findAdditionalContractsByDealId(params.id),
  ]);
  return ok({ primary, additional });
}

/**
 * Add a contract to a deal (never sent — a person sends it with the invoice):
 * { contractTemplateId }. The first contract becomes the deal's primary;
 * later ones are additional contracts (max 10). Returns the new contract's
 * scope (its template fields).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const gate = await gateDeal(auth.token, params.id);
    if (gate.error) return gate.error;
    if (gate.deal.status !== "closed") {
      return fail("invalid_request", "Only closed deals carry contracts", 400);
    }

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);
    const raw = body.contractTemplateId;
    if (raw !== null && (typeof raw !== "string" || !raw)) {
      return fail("invalid_request", "contractTemplateId must be a template id (see listContractTemplates) or null", 400);
    }
    const contractTemplateId = raw as string | null;
    const actor = tokenAuditActor(auth.token);
    const ref = await addDealContract(params.id, contractTemplateId, actor.adminId);

    logAuditEvent({
      ...actor,
      action: "deal_contract.create",
      targetType: "deal_contract",
      targetId: ref.record.id,
      details: JSON.stringify({ dealId: params.id, kind: ref.kind, contractTemplateId }),
    }).catch(() => {});

    return ok(await getContractScope(ref), undefined, { status: 201 });
  } catch (err) {
    return prepErrorResponse(err, "POST /api/v1/closer/deals/[id]/contracts");
  }
}
