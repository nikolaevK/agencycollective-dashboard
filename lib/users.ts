import fs from "fs";
import path from "path";

export interface UserRecord {
  id: string;
  accountId: string;
  displayName: string;
  logoPath: string | null;
  passwordHash: string | null;
}

const USERS_FILE = path.join(process.cwd(), "data", "users.json");

export function readUsers(): UserRecord[] {
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(raw) as UserRecord[];
  } catch {
    return [];
  }
}

export function writeUsers(users: UserRecord[]): void {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

export function normalizeAccountId(raw: string): string {
  const stripped = String(raw).trim().replace(/^act_/, "");
  return `act_${stripped}`;
}
