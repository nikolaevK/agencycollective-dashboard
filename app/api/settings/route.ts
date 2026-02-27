import { NextResponse } from "next/server";
import { fetchOwnedAccounts } from "@/lib/meta/endpoints";
import cache, { TTL } from "@/lib/cache";
import { TokenExpiredError, RateLimitError } from "@/lib/meta/client";

export interface SettingsResponse {
  tokenConfigured: boolean;
  tokenMasked: string;
  accountCount: number;
  accounts: { id: string; name: string; status: number; currency: string }[];
}

const SETTINGS_CACHE_KEY = "settings:token_accounts";

export async function GET() {
  const rawToken = process.env.META_ACCESS_TOKEN ?? "";
  const isPlaceholder =
    !rawToken ||
    rawToken.startsWith("EAAxxxxx") ||
    rawToken.length < 20;

  const tokenMasked = rawToken.length >= 10
    ? `${rawToken.slice(0, 6)}...${rawToken.slice(-4)}`
    : rawToken || "not set";

  if (isPlaceholder) {
    const body: SettingsResponse = {
      tokenConfigured: false,
      tokenMasked,
      accountCount: 0,
      accounts: [],
    };
    return NextResponse.json({ data: body });
  }

  const cached = cache.get<SettingsResponse>(SETTINGS_CACHE_KEY);
  if (cached) {
    return NextResponse.json({ data: cached });
  }

  try {
    const accounts = await fetchOwnedAccounts();
    const body: SettingsResponse = {
      tokenConfigured: true,
      tokenMasked,
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
      const body: SettingsResponse = {
        tokenConfigured: false,
        tokenMasked,
        accountCount: 0,
        accounts: [],
      };
      return NextResponse.json({ data: body });
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
