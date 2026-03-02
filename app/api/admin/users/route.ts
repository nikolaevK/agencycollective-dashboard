export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  readUsers,
  findUser,
  insertUser,
  deleteUser,
  normalizeAccountId,
  slugify,
  generateUniqueSlug,
} from "@/lib/users";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

export async function GET() {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await readUsers();
  // Never expose passwordHash to the client
  const safe = users.map(({ passwordHash: _, ...rest }) => rest);
  return NextResponse.json({ data: safe });
}

export async function POST(request: Request) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, accountId, displayName, logoPath } = body as {
      id?: string;
      accountId?: string;
      displayName?: string;
      logoPath?: string | null;
    };

    if (!id || !accountId || !displayName) {
      return NextResponse.json(
        { error: "id, accountId, and displayName are required" },
        { status: 400 }
      );
    }

    const trimmedId = String(id).trim();
    const trimmedDisplay = String(displayName).trim();

    const existing = await findUser(trimmedId);
    if (existing) {
      return NextResponse.json({ error: "User ID already exists" }, { status: 409 });
    }

    const slug = await generateUniqueSlug(
      slugify(trimmedDisplay) || slugify(trimmedId)
    );

    const newUser = {
      id: trimmedId,
      slug,
      accountId: normalizeAccountId(accountId),
      displayName: trimmedDisplay,
      logoPath: logoPath ?? null,
      passwordHash: null,
    };

    await insertUser(newUser);

    const { passwordHash: _, ...safe } = newUser;
    return NextResponse.json({ data: safe }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
