export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, corsPreflight } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { gateDeal, prepErrorResponse } from "@/lib/api/dealPrepApi";
import { buildDealPrepContext } from "@/lib/dealPrepContext";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Everything the deal-prep agent needs in one read: procedure, playbook, the
 * deal + notes, its current draft paperwork (logo-free), the preset/template
 * catalogs, and the most similar past deals with what was actually sent.
 * 409 when a person is handling the deal's paperwork (or there's nothing to
 * prepare) — the agent skips it.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    const gate = await gateDeal(auth.token, params.id);
    if (gate.error) return gate.error;
    return ok(await buildDealPrepContext(gate.deal, { closerIds: allowedResourceIds(auth.token, "closer") }));
  } catch (err) {
    return prepErrorResponse(err, "GET /api/v1/closer/deals/[id]/prep-context");
  }
}
