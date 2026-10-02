import type { DirectoryActor } from "@/lib/api/requireAdmin";
import { inWorkspaceScope } from "@/lib/workspaces";
import { getInvoiceDraft, resolveInvoiceDraftTargets, type InvoiceDraft } from "@/lib/invoiceDrafts";

/**
 * Load an invoice draft the dashboard actor may see. Out-of-scope (or
 * orphaned) drafts read as NOT FOUND — same no-probing rule as the per-client
 * routes (CLAUDE.md "Workspace scoping is in-route").
 */
export async function loadScopedInvoiceDraft(
  actor: DirectoryActor,
  id: string
): Promise<{ draft: InvoiceDraft; clientName: string | null; accountName: string | null } | null> {
  const draft = await getInvoiceDraft(id);
  if (!draft) return null;
  const target = (await resolveInvoiceDraftTargets([draft])).get(draft.id);
  if (!target || !inWorkspaceScope(actor.scope, target.workspace)) return null;
  return { draft, clientName: target.clientName, accountName: target.accountName };
}
