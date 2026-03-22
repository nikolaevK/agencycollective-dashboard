export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { readActiveAccountsForUser } from "@/lib/clientAccounts";
import { fetchOwnedAccounts } from "@/lib/meta/endpoints";
import cache, { TTL } from "@/lib/cache";

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accounts = await readActiveAccountsForUser(session.userId);

    // Enrich with Meta account names where available
    const accountsCacheKey = "accounts:list";
    let metaAccounts = cache.get<Array<{ id: string; name: string; currency: string }>>(accountsCacheKey);
    if (!metaAccounts) {
      try {
        const raw = await fetchOwnedAccounts();
        metaAccounts = raw.map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
        cache.set(accountsCacheKey, metaAccounts, TTL.ACCOUNTS);
      } catch {
        metaAccounts = [];
      }
    }

    const metaMap = new Map(metaAccounts.map((a) => [a.id, a]));

    const enriched = accounts.map((a) => {
      const meta = metaMap.get(a.accountId);
      return {
        accountId: a.accountId,
        label: a.label,
        metaName: meta?.name ?? null,
        currency: meta?.currency ?? null,
      };
    });

    return NextResponse.json({
      data: enriched,
      currentAccountId: session.accountId,
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
    });
  } catch (err) {
    console.error("User accounts error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
