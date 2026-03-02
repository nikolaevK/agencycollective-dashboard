import { NextResponse } from "next/server";
import { fetchOwnedAccounts } from "@/lib/meta/endpoints";
import cache, { TTL } from "@/lib/cache";
import { TokenExpiredError, RateLimitError } from "@/lib/meta/client";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";

export interface SettingsResponse {
  tokenConfigured: boolean;
  accountCount: number;
  accounts: { id: string; name: string; status: number; currency: string }[];
}

const SETTINGS_CACHE_KEY = "settings:accounts";

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await findAdmin(session.adminId);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawToken = process.env.META_ACCESS_TOKEN ?? "";
  const isPlaceholder = !rawToken || rawToken.startsWith("EAAxxxxx") || rawToken.length < 20;

  if (isPlaceholder) {
    return NextResponse.json({ data: { tokenConfigured: false, accountCount: 0, accounts: [] } });
  }

  const cached = cache.get<SettingsResponse>(SETTINGS_CACHE_KEY);
  if (cached) return NextResponse.json({ data: cached });

  try {
    const accounts = await fetchOwnedAccounts();
    const body: SettingsResponse = {
      tokenConfigured: true,
      accountCount: accounts.length,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.account_status,
        currency: a.currency,
      })),
    };
    cache.set(SETTINGS_CACHE_KEY, body, TTL.ACCOUNTS);
    return NextResponse.json({ data: body });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ data: { tokenConfigured: false, accountCount: 0, accounts: [] } });
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message, retryAfter: err.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } }
      );
    }
    console.error("Settings API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
