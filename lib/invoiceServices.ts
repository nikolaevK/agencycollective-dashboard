import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

export interface InvoiceServiceRecord {
  id: string;
  name: string;
  description: string;
  /** Internal-only label to differentiate presets that share an invoice
   *  header (shown in the service picker, never on the invoice itself). */
  internalLabel: string | null;
  rate: number; // cents
  dealServiceKey: string | null;
  sortOrder: number;
  createdAt: string;
}

function rowToService(row: Row): InvoiceServiceRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    internalLabel: row.internal_label != null ? String(row.internal_label) : null,
    rate: Number(row.rate ?? 0),
    dealServiceKey: row.deal_service_key != null ? String(row.deal_service_key) : null,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function readInvoiceServices(): Promise<InvoiceServiceRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT * FROM invoice_services ORDER BY sort_order, name");
  return result.rows.map(rowToService);
}

export async function findInvoiceService(id: string): Promise<InvoiceServiceRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM invoice_services WHERE id = ?", args: [id] });
  return result.rows[0] ? rowToService(result.rows[0]) : null;
}

export async function insertInvoiceService(service: {
  id: string;
  name: string;
  description: string;
  internalLabel?: string | null;
  rate: number;
  dealServiceKey?: string | null;
  sortOrder?: number;
}): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO invoice_services (id, name, description, internal_label, rate, deal_service_key, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [service.id, service.name, service.description, service.internalLabel ?? null, service.rate, service.dealServiceKey ?? null, service.sortOrder ?? 0],
  });
}

export async function updateInvoiceService(
  id: string,
  changes: { name?: string; description?: string; internalLabel?: string | null; rate?: number; dealServiceKey?: string | null; sortOrder?: number }
): Promise<void> {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (changes.name !== undefined) { fields.push("name = ?"); args.push(changes.name); }
  if (changes.description !== undefined) { fields.push("description = ?"); args.push(changes.description); }
  if (changes.internalLabel !== undefined) { fields.push("internal_label = ?"); args.push(changes.internalLabel); }
  if (changes.rate !== undefined) { fields.push("rate = ?"); args.push(changes.rate); }
  if (changes.dealServiceKey !== undefined) { fields.push("deal_service_key = ?"); args.push(changes.dealServiceKey); }
  if (changes.sortOrder !== undefined) { fields.push("sort_order = ?"); args.push(changes.sortOrder); }

  if (fields.length === 0) return;
  args.push(id);

  await ensureMigrated();
  const db = getDb();
  await db.execute({ sql: `UPDATE invoice_services SET ${fields.join(", ")} WHERE id = ?`, args });
}

export async function deleteInvoiceService(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM invoice_services WHERE id = ?", args: [id] });
  return (result.rowsAffected ?? 0) > 0;
}

