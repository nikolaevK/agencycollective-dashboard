import crypto from "crypto";
import { cookies } from "next/headers";

const ADMIN_SESSION_COOKIE = "a_sess";
const SECRET = process.env.SESSION_SECRET || "dev-secret-please-change";

export interface AdminSessionData {
  adminId: string;
  username: string;
}

export function createAdminSession(data: AdminSessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAdminSession(token: string): AdminSessionData | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  if (expected !== sig) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function getAdminSession(): AdminSessionData | null {
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSession(token);
}

export const ADMIN_SESSION_COOKIE_NAME = ADMIN_SESSION_COOKIE;
export const ADMIN_SESSION_MAX_AGE = 7 * 24 * 60 * 60;
