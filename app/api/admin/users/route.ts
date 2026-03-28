export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readUsers, deleteUser } from "@/lib/users";
import { readAllClientAccounts } from "@/lib/clientAccounts";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { getPayoutAggregatesByBrand } from "@/lib/payouts";

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

  // Fetch payout aggregates for MRR and total revenue
  const now = new Date();
  const payoutAggregates = await getPayoutAggregatesByBrand(
    now.getMonth() + 1,
    now.getFullYear()
  );

  function normalize(s: string): string {
    return s.toLowerCase().replace(/\s/g, "");
  }

  // Build response — strip passwordHash, include accounts + payout metrics
  const safe = users.map(({ passwordHash, ...rest }) => {
    const normName = normalize(rest.displayName);
    let payoutMrr = 0;
    let totalRevenue = 0;
    if (normName.length > 0) {
      for (const agg of payoutAggregates) {
        if (agg.normalizedBrandName.includes(normName)) {
          payoutMrr += agg.currentMonthAmountDue;
          totalRevenue += agg.totalAmountPaid;
        }
      }
    }

    return {
      ...rest,
      hasPassword: Boolean(passwordHash),
      accounts: accountsByUser.get(rest.id) ?? [],
      payoutMrr,
      totalRevenue,
    };
  });

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
