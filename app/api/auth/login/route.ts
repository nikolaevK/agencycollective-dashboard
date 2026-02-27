import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";

interface UserRecord {
  id: string;
  accountId: string;
  displayName: string;
}

function readUsers(): UserRecord[] {
  const filePath = path.join(process.cwd(), "data", "users.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as UserRecord[];
  } catch {
    return [];
  }
}

function normalizeAccountId(raw: string): string {
  const stripped = raw.replace(/^act_/, "");
  return `act_${stripped}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, accountId } = body as { userId?: string; accountId?: string };

    if (!userId || !accountId) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const normalized = normalizeAccountId(String(accountId).trim());
    const users = readUsers();
    const user = users.find(
      (u) => u.id === String(userId).trim() && u.accountId === normalized
    );

    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = createSession({ userId: user.id, accountId: normalized });
    cookies().set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
