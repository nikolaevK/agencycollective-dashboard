import crypto from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "u_sess";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET env var must be set in production (min 32 chars recommended)");
  }
  return s || "dev-secret-please-change";
}

export interface SessionData {
  userId: string;
  accountId: string;
}

export function createSession(data: SessionData): string {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ ...data, iat: now, exp: now + SESSION_MAX_AGE })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySession(token: string): SessionData | null {
  const secret = getSecret();
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // Enforce token expiration
    if (data.exp && Math.floor(Date.now() / 1000) > data.exp) return null;
    return data as SessionData;
  } catch {
    return null;
  }
}

export function getSession(): SessionData | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
