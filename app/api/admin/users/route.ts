export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { deleteUser } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { buildClientDirectory, filterRowsByWorkspace } from "@/lib/clientDirectory";
import { requireDirectoryActor, findClientInScope } from "@/lib/api/requireAdmin";

export async function GET(request: Request) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const searchTerm = searchParams.get("search")?.toLowerCase();

  // Aggregator joins users + accounts + payout cross-reference + billing
  // schedule. passwordHash is never included (only the hasPassword boolean),
  // and the accounts array still comes straight from client_accounts — the
  // portal/account linkage is unchanged; this response only gained fields.
  // Workspace scoping happens HERE (the build is shared/unscoped): a scoped
  // admin only ever receives rows from their own book(s).
  let rows = filterRowsByWorkspace(await buildClientDirectory(), actor.scope);

  if (statusFilter && statusFilter !== "all") {
    rows = rows.filter((r) => r.status === statusFilter);
  }

  if (searchTerm) {
    rows = rows.filter(
      (r) =>
        r.displayName.toLowerCase().includes(searchTerm) ||
        r.email?.toLowerCase().includes(searchTerm) ||
        r.category?.toLowerCase().includes(searchTerm) ||
        r.payoutBrand?.toLowerCase().includes(searchTerm)
    );
  }

  return NextResponse.json({ data: rows });
}

export async function DELETE(request: Request) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    // Out-of-scope clients read as not-found (no cross-book id probing).
    if (!(await findClientInScope(actor.scope, id))) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const deleted = await deleteUser(id);
    if (!deleted) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
