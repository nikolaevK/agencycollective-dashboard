import { headers } from "next/headers";
import { checkRate } from "@/lib/rateLimit";

const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

/**
 * Brute-force guard for the password login server actions. Keyed by
 * identifier + caller IP so one attacker can't lock a victim out from a
 * different network, while a single IP spraying many identifiers still
 * burns one bucket per identifier. Same soft per-process semantics as
 * lib/rateLimit (good enough as a spam guard; scrypt cost does the rest).
 */
export function checkLoginRate(scope: string, identifier: string): { ok: boolean; error?: string } {
  const forwarded = headers().get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const key = `login:${scope}:${identifier.trim().toLowerCase()}:${ip}`;
  const result = checkRate(key, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS);
  if (!result.ok) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }
  return { ok: true };
}
