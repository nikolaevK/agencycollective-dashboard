import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface UserRecord {
  id: string;
  accountId: string;
  displayName: string;
}

const USERS_FILE = path.join(process.cwd(), "data", "users.json");

function readUsers(): UserRecord[] {
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(raw) as UserRecord[];
  } catch {
    return [];
  }
}

function writeUsers(users: UserRecord[]): void {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function normalizeAccountId(raw: string): string {
  const stripped = String(raw).trim().replace(/^act_/, "");
  return `act_${stripped}`;
}

export async function GET() {
  const users = readUsers();
  return NextResponse.json({ data: users });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, accountId, displayName } = body as Partial<UserRecord>;

    if (!id || !accountId || !displayName) {
      return NextResponse.json({ error: "id, accountId, and displayName are required" }, { status: 400 });
    }

    const users = readUsers();
    if (users.find((u) => u.id === String(id).trim())) {
      return NextResponse.json({ error: "User ID already exists" }, { status: 409 });
    }

    const newUser: UserRecord = {
      id: String(id).trim(),
      accountId: normalizeAccountId(accountId),
      displayName: String(displayName).trim(),
    };

    users.push(newUser);
    writeUsers(users);

    return NextResponse.json({ data: newUser }, { status: 201 });
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
