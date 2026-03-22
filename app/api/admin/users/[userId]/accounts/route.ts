export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { findUser } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import {
  readAccountsForUser,
  addAccountToUser,
  removeAccountFromUser,
  toggleAccountActive,
} from "@/lib/clientAccounts";

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

interface RouteContext {
  params: { userId: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const user = await findUser(params.userId);
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const accounts = await readAccountsForUser(params.userId);
  return NextResponse.json({ data: accounts });
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  try {
    const body = await request.json();
    const { accountId, label } = body as { accountId?: string; label?: string };

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const user = await findUser(params.userId);
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    await addAccountToUser(params.userId, accountId.trim(), label?.trim());

    const accounts = await readAccountsForUser(params.userId);
    return NextResponse.json({ data: accounts }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json({ error: "accountId query param is required" }, { status: 400 });
    }

    const deleted = await removeAccountFromUser(params.userId, accountId);
    if (!deleted)
      return NextResponse.json({ error: "Account not found for this user" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  try {
    const body = await request.json();
    const { accountId, isActive } = body as { accountId?: string; isActive?: boolean };

    if (!accountId || isActive === undefined) {
      return NextResponse.json({ error: "accountId and isActive are required" }, { status: 400 });
    }

    await toggleAccountActive(params.userId, accountId, isActive);

    const accounts = await readAccountsForUser(params.userId);
    return NextResponse.json({ data: accounts });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
