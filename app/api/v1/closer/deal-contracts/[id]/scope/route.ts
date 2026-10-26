export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Clone + read + write against DocuSeal (each up to a few seconds).
export const maxDuration = 60;

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { gateContract, prepErrorResponse } from "@/lib/api/dealPrepApi";
import { getContractScope, resetContractScope, updateContractScope } from "@/lib/dealContractScope";
import { parseScopeOps } from "@/lib/dealPrepRules";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * The contract's scope: the DocuSeal template it sends from (this deal's own
 * copy once customized, else the base) with every field — uuid, 0-based page,
 * position as page fractions, printed value, a role hint, editable/removable.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    const gate = await gateContract(auth.token, params.id);
    if (gate.error) return gate.error;
    return ok(await getContractScope(gate.ref));
  } catch (err) {
    return prepErrorResponse(err, "GET /api/v1/closer/deal-contracts/[id]/scope");
  }
}

/**
 * Customize an unsent contract's scope on this deal's own copy of the
 * template (created on first edit; base templates are never changed):
 * { edits?: [{ uuid, value, fontSize? }], remove?: [uuid], add?: [{ type:
 * text|initials|date, page, x, y, w, h, value?, fontSize? }] } — or
 * { reset: true } to drop the customization. Only read-only agency text can be
 * edited; signatures and client-filled fields are protected. 409 once sent.
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
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    let scope;
    let details: Record<string, unknown>;
    if (body.reset === true) {
      scope = await resetContractScope(gate.ref);
      details = { reset: true };
    } else {
      const parsed = parseScopeOps(body);
      if (!parsed.ok) return fail("invalid_request", parsed.error, 400);
      scope = await updateContractScope(gate.ref, parsed.value);
      details = {
        edits: parsed.value.edits?.length ?? 0,
        removed: parsed.value.remove?.length ?? 0,
        added: parsed.value.add?.length ?? 0,
        docusealTemplateId: scope.docusealTemplateId,
      };
    }

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "deal_contract.update_scope",
      targetType: "deal_contract",
      targetId: params.id,
      details: JSON.stringify({ dealId: gate.deal.id, ...details }),
    }).catch(() => {});

    return ok(scope);
  } catch (err) {
    return prepErrorResponse(err, "PATCH /api/v1/closer/deal-contracts/[id]/scope");
  }
}
