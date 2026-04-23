import crypto from "crypto";
import { cookies } from "next/headers";
import type { CloserRole } from "./closers";

const CLOSER_COOKIE = "c_sess";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error("SESSION_SECRET env var is required (min 32 random chars). Add it to .env.local for development.");
  }
  return s;
}

export interface CloserSessionData {
  closerId: string;
  slug: string;
  displayName: string;
  role?: CloserRole;
}

export function createCloserSession(data: CloserSessionData): string {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ ...data, iat: now, exp: now + CLOSER_SESSION_MAX_AGE })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyCloserSession(token: string): CloserSessionData | null {
  const secret = getSecret();
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp && Math.floor(Date.now() / 1000) > data.exp) return null;
    return data as CloserSessionData;
  } catch {
    return null;
  }
}

export function getCloserSession(): CloserSessionData | null {
  const token = cookies().get(CLOSER_COOKIE)?.value;
  if (!token) return null;
  return verifyCloserSession(token);
}

export const CLOSER_SESSION_COOKIE_NAME = CLOSER_COOKIE;
export const CLOSER_SESSION_MAX_AGE = 7 * 24 * 60 * 60;
