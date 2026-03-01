import { NextResponse } from "next/server";
import { readUsers, writeUsers, normalizeAccountId } from "@/lib/users";

export async function GET() {
  const users = readUsers();
  // Never expose passwordHash to the client
  const safe = users.map(({ passwordHash: _, ...rest }) => rest);
  return NextResponse.json({ data: safe });
}

export async function POST(request: Request) {
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

    const users = readUsers();
    if (users.find((u) => u.id === String(id).trim())) {
      return NextResponse.json({ error: "User ID already exists" }, { status: 409 });
    }

    const newUser = {
      id: String(id).trim(),
      accountId: normalizeAccountId(accountId),
      displayName: String(displayName).trim(),
      logoPath: logoPath ?? null,
      passwordHash: null,
    };

    users.push(newUser);
    writeUsers(users);

    const { passwordHash: _, ...safe } = newUser;
    return NextResponse.json({ data: safe }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const users = readUsers();
    const filtered = users.filter((u) => u.id !== id);

    if (filtered.length === users.length) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    writeUsers(filtered);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
