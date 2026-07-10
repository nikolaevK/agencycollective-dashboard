import type { MetaAccount } from "./metaAccounts";

// Pure summary computation for the Meta Accounts Directory — no DB imports,
// so BOTH the server builder (lib/metaAccountDirectory.ts) and the client
// (MetaAccountsDirectory reconciling after an inline edit without refetching
// the whole directory) derive the filter-card counts from the same code.

export interface MetaAccountSummary {
  total: number;
  byStage: Record<string, number>;
  byStatus: Record<string, number>;
  setupComplete: number; // all five checklist steps done
  unassignedClient: number;
  batches: { label: string; count: number }[];
}

export function summarizeMetaAccounts(accounts: readonly MetaAccount[]): MetaAccountSummary {
  const byStage: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const batchCounts = new Map<string, number>();
  let setupComplete = 0;
  let unassignedClient = 0;

  for (const a of accounts) {
    if (a.stage) byStage[a.stage] = (byStage[a.stage] ?? 0) + 1;
    if (a.status) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    if (a.loginOk && a.pageMade && a.adAccountMade && a.bmMade && a.cardAdded) setupComplete++;
    if (!a.clientId) unassignedClient++;
    const b = a.batch?.trim() || "Unbatched";
    batchCounts.set(b, (batchCounts.get(b) ?? 0) + 1);
  }

  const batches = [...batchCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return { total: accounts.length, byStage, byStatus, setupComplete, unassignedClient, batches };
}
