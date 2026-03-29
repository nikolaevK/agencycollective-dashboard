import crypto from "crypto";
import { cookies } from "next/headers";
import type { AdminPermissions } from "./permissions";

const ADMIN_SESSION_COOKIE = "a_sess";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error("SESSION_SECRET env var is required (min 32 random chars). Add it to .env.local for development.");
  }
  return s;
}

export interface AdminSessionData {
  adminId: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  isSuper: boolean;
  permissions: AdminPermissions;
}

export function createAdminSession(data: AdminSessionData): string {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ ...data, iat: now, exp: now + ADMIN_SESSION_MAX_AGE })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAdminSession(token: string): AdminSessionData | null {
  const secret = getSecret();
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  // Constant-time comparison to prevent timing attacks
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // Enforce token expiration
    if (data.exp && Math.floor(Date.now() / 1000) > data.exp) return null;
    // Backwards compatibility: older tokens without permissions still work
    return {
      adminId: data.adminId,
      username: data.username,
      displayName: data.displayName ?? null,
      avatarPath: data.avatarPath ?? null,
      isSuper: data.isSuper ?? false,
      permissions: data.permissions ?? {
        dashboard: false,
        analyst: false,
        studio: false,
        jsoneditor: false,
        adcopy: false,
        users: false,
        closers: false,
        admin: false,
      },
    };
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
