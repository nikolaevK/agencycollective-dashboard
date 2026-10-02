import type { ApiTokenRecord } from "@/lib/apiTokens";
import { tokenHasResource } from "@/lib/apiScopes";
import {
  getInvoiceDraft,
  resolveInvoiceDraftTargets,
  type InvoiceDraft,
  type InvoiceDraftTarget,
} from "@/lib/invoiceDrafts";

/**
 * v1 access to one invoice draft: resolves the draft's CURRENT target and
 * applies the token's client restriction (which also carries any workspace
 * restriction — authenticateApiRequest folds books into clientIds).
 */
export async function loadInvoiceDraftForToken(
  token: ApiTokenRecord,
  id: string
): Promise<
  | { ok: true; draft: InvoiceDraft; target: InvoiceDraftTarget }
  | { ok: false; status: 403 | 404 }
> {
  const draft = await getInvoiceDraft(id);
  if (!draft) return { ok: false, status: 404 };
  const target = (await resolveInvoiceDraftTargets([draft])).get(draft.id);
  if (!target) return { ok: false, status: 404 };
  if (!tokenHasResource(token, "client", target.ownerUserId)) return { ok: false, status: 403 };
  return { ok: true, draft, target };
}
