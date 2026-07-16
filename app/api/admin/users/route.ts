export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { deleteUser } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { buildClientDirectory } from "@/lib/clientDirectory";
import { requireAdminRecord as requireAdminSession } from "@/lib/api/requireAdmin";

export async function GET(request: Request) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const searchTerm = searchParams.get("search")?.toLowerCase();

  // Aggregator joins users + accounts + payout cross-reference + billing
  // schedule. passwordHash is never included (only the hasPassword boolean),
  // and the accounts array still comes straight from client_accounts — the
  // portal/account linkage is unchanged; this response only gained fields.
  let rows = await buildClientDirectory();

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
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
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
