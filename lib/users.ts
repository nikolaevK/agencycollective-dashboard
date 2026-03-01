import fs from "fs";
import path from "path";

export interface UserRecord {
  id: string;
  slug: string;
  accountId: string;
  displayName: string;
  logoPath: string | null;
  passwordHash: string | null;
}

/** Convert a display name to a URL-safe slug, e.g. "Inner Glow" → "inner-glow" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Return a slug that doesn't clash with existing users (appends -2, -3 … if needed) */
export function uniqueSlug(
  base: string,
  users: UserRecord[],
  excludeId?: string
): string {
  const taken = new Set(
    users.filter((u) => u.id !== excludeId).map((u) => u.slug)
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
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
