export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readUsers, deleteUser } from "@/lib/users";
import { readAllClientAccounts } from "@/lib/clientAccounts";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

export async function GET(request: Request) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const searchTerm = searchParams.get("search")?.toLowerCase();

  let users = await readUsers();

  // Filter by status
  if (statusFilter && statusFilter !== "all") {
    users = users.filter((u) => u.status === statusFilter);
  }

  // Search filter
  if (searchTerm) {
    users = users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(searchTerm) ||
        u.email?.toLowerCase().includes(searchTerm) ||
        u.category?.toLowerCase().includes(searchTerm)
    );
  }

  // Load all client accounts and group by userId
  const allAccounts = await readAllClientAccounts();
  const accountsByUser = new Map<string, typeof allAccounts>();
  for (const account of allAccounts) {
    const list = accountsByUser.get(account.userId) ?? [];
    list.push(account);
    accountsByUser.set(account.userId, list);
  }

  // Build response — strip passwordHash, include accounts
  const safe = users.map(({ passwordHash, ...rest }) => ({
    ...rest,
    hasPassword: Boolean(passwordHash),
    accounts: accountsByUser.get(rest.id) ?? [],
  }));

  return NextResponse.json({ data: safe });
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
