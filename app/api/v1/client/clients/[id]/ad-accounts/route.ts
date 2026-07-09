export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { findUser } from "@/lib/users";
import { listAdAccountsForUser } from "@/lib/adAccounts";

export function OPTIONS() {
  return corsPreflight();
}

/** Ad accounts attached to one client. */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  const user = await findUser(params.id);
  if (!user) return fail("not_found", "Client not found", 404);

  const accounts = await listAdAccountsForUser(params.id);
  return ok(accounts);
}
