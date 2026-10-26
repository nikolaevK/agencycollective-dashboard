export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { gateContract, prepErrorResponse } from "@/lib/api/dealPrepApi";
import { deletePendingAdditionalContract, getContractScope, setContractTemplate } from "@/lib/dealContractScope";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Change an unsent contract's template: { contractTemplateId } (null = no
 * contract). Clears any per-deal scope customization — the scope restarts from
 * the new base. 409 once sent. Returns the contract's scope.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const gate = await gateContract(auth.token, params.id);
    if (gate.error) return gate.error;

    const body = await readJsonBody(request);
    if (!body || !("contractTemplateId" in body)) {
      return fail("invalid_request", "Body must include contractTemplateId (a template id or null)", 400);
    }
    const raw = body.contractTemplateId;
    if (raw !== null && (typeof raw !== "string" || !raw)) {
      return fail("invalid_request", "contractTemplateId must be a template id or null", 400);
    }

    await setContractTemplate(gate.ref, raw as string | null);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "deal_contract.update",
      targetType: "deal_contract",
      targetId: params.id,
      details: JSON.stringify({ dealId: gate.deal.id, contractTemplateId: raw }),
    }).catch(() => {});

    return ok(await getContractScope(gate.ref));
  } catch (err) {
    return prepErrorResponse(err, "PATCH /api/v1/closer/deal-contracts/[id]");
  }
}

/** Delete an ADDITIONAL contract that was never sent (409 once sent). */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:delete");
  if (!auth.ok) return auth.response;

  try {
    const gate = await gateContract(auth.token, params.id);
    if (gate.error) return gate.error;

    await deletePendingAdditionalContract(gate.ref);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "deal_contract.delete",
      targetType: "deal_contract",
      targetId: params.id,
      details: JSON.stringify({ dealId: gate.deal.id }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    return prepErrorResponse(err, "DELETE /api/v1/closer/deal-contracts/[id]");
  }
}
