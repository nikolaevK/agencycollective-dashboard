import { ensureMigrated, getDb } from "./db";
import { listMetaAccounts, type MetaAccount } from "./metaAccounts";
import { summarizeMetaAccounts, type MetaAccountSummary } from "./metaAccountSummary";

export type { MetaAccountSummary } from "./metaAccountSummary";

// ---------------------------------------------------------------------------
// Meta Accounts Directory builder — enriches account rows with the linked
// client's name and computes the summary the UI's filter cards read from. The
// stage/status vocabulary (labels + colors) is delivered separately by the
// options hook (useMetaAccountOptions); byStage/byStatus here are keyed by the
// option `value` slug, which the UI maps to labels.
// ---------------------------------------------------------------------------

export interface MetaAccountDirectoryRow extends MetaAccount {
  clientName: string | null;
}

export interface MetaClientOption {
  id: string;
  name: string;
}

export interface MetaAccountDirectory {
  rows: MetaAccountDirectoryRow[];
  summary: MetaAccountSummary;
  clients: MetaClientOption[];
}

/** Lightweight client list for the "assign client" dropdown. */
export async function listClientOptions(): Promise<MetaClientOption[]> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute(
      "SELECT id, display_name FROM users ORDER BY display_name COLLATE NOCASE"
    );
    return result.rows.map((r) => ({
      id: String(r.id),
      name: r.display_name != null ? String(r.display_name) : "",
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such table/i.test(msg)) return [];
    throw err;
  }
}

export async function buildMetaAccountDirectory(): Promise<MetaAccountDirectory> {
  const [accounts, clients] = await Promise.all([listMetaAccounts(), listClientOptions()]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const rows: MetaAccountDirectoryRow[] = accounts.map((a) => ({
    ...a,
    clientName: a.clientId ? clientName.get(a.clientId) ?? null : null,
  }));

  return { rows, summary: summarizeMetaAccounts(accounts), clients };
}
