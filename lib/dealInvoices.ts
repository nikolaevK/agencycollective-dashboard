import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import type { InvoiceData } from "@/types/invoice";

export interface DealInvoiceRecord {
  id: string;
  dealId: string;
  invoiceNumber: string;
  invoiceData: InvoiceData;
  status: "draft" | "sent";
  clientEmail: string | null;
  sentAt: string | null;
  sentCount: number;
  hasPdf: boolean;
  createdBy: string | null;
  sentBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToInvoice(row: Row): DealInvoiceRecord {
  return {
    id: String(row.id),
    dealId: String(row.deal_id),
    invoiceNumber: String(row.invoice_number),
    invoiceData: (() => { try { return JSON.parse(String(row.invoice_data)) as InvoiceData; } catch { return {} as InvoiceData; } })(),
    status: String(row.status) as "draft" | "sent",
    clientEmail: row.client_email != null ? String(row.client_email) : null,
    sentAt: row.sent_at != null ? String(row.sent_at) : null,
    sentCount: Number(row.sent_count ?? 0),
    hasPdf: row.pdf_data != null && row.pdf_data !== "",
    createdBy: row.created_by != null ? String(row.created_by) : null,
    sentBy: row.sent_by != null ? String(row.sent_by) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function findDealInvoiceByDealId(dealId: string): Promise<DealInvoiceRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM deal_invoices WHERE deal_id = ?", args: [dealId] });
  return result.rows[0] ? rowToInvoice(result.rows[0]) : null;
}

export async function findDealInvoice(id: string): Promise<DealInvoiceRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM deal_invoices WHERE id = ?", args: [id] });
  return result.rows[0] ? rowToInvoice(result.rows[0]) : null;
}

export async function insertDealInvoice(record: {
  id: string;
  dealId: string;
  invoiceNumber: string;
  invoiceData: string; // JSON string
  status?: string;
  clientEmail?: string | null;
  createdBy?: string | null;
}): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO deal_invoices (id, deal_id, invoice_number, invoice_data, status, client_email, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.id,
      record.dealId,
      record.invoiceNumber,
      record.invoiceData,
      record.status ?? "draft",
      record.clientEmail ?? null,
      record.createdBy ?? null,
    ],
  });

}

export async function updateDealInvoice(
  id: string,
  changes: {
    invoiceData?: string;
    status?: string;
    clientEmail?: string | null;
    sentAt?: string | null;
    sentCount?: number;
    sentBy?: string | null;
    pdfData?: Buffer;
  }
): Promise<void> {
  const fields: string[] = [];
  const args: (string | number | Buffer | null)[] = [];

  if (changes.invoiceData !== undefined) { fields.push("invoice_data = ?"); args.push(changes.invoiceData); }
  if (changes.status !== undefined) { fields.push("status = ?"); args.push(changes.status); }
  if (changes.clientEmail !== undefined) { fields.push("client_email = ?"); args.push(changes.clientEmail); }
  if (changes.sentAt !== undefined) { fields.push("sent_at = ?"); args.push(changes.sentAt); }
  if (changes.sentCount !== undefined) { fields.push("sent_count = ?"); args.push(changes.sentCount); }
  if (changes.sentBy !== undefined) { fields.push("sent_by = ?"); args.push(changes.sentBy); }
  if (changes.pdfData !== undefined) { fields.push("pdf_data = ?"); args.push(changes.pdfData); }

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  args.push(id);

  await ensureMigrated();
  const db = getDb();
  await db.execute({ sql: `UPDATE deal_invoices SET ${fields.join(", ")} WHERE id = ?`, args });

}

export async function getDealInvoicePdf(id: string): Promise<Buffer | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT pdf_data FROM deal_invoices WHERE id = ?", args: [id] });
  const row = result.rows[0];
  if (!row || !row.pdf_data) return null;
  return Buffer.from(row.pdf_data as ArrayBuffer);
}

export async function deleteDealInvoice(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM deal_invoices WHERE id = ?", args: [id] });

  return (result.rowsAffected ?? 0) > 0;
}

/** Generate next sequential invoice number for the current day (checks both tables). */
export async function generateInvoiceNumber(): Promise<string> {
  await ensureMigrated();
  const db = getDb();
  const now = new Date();
  const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const result = await db.execute({
    sql: `SELECT MAX(max_seq) as max_seq FROM (
      SELECT MAX(CAST(SUBSTR(invoice_number, LENGTH(?) + 2) AS INTEGER)) as max_seq
      FROM deal_invoices WHERE invoice_number LIKE ?
      UNION ALL
      SELECT MAX(CAST(SUBSTR(invoice_number, LENGTH(?) + 2) AS INTEGER)) as max_seq
      FROM deal_additional_invoices WHERE invoice_number LIKE ?
    )`,
    args: [prefix, `${prefix}-%`, prefix, `${prefix}-%`],
  });
  const seq = Number(result.rows[0]?.max_seq ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

/** Batch fetch invoice statuses for a list of deal IDs. */
export async function getDealInvoiceStatuses(
  dealIds: string[]
): Promise<Record<string, { status: string; invoiceNumber: string }>> {
  if (dealIds.length === 0) return {};
  const capped = dealIds.slice(0, 500);
  await ensureMigrated();
  const db = getDb();
  const placeholders = capped.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT deal_id, status, invoice_number FROM deal_invoices WHERE deal_id IN (${placeholders})`,
    args: capped,
  });
  const map: Record<string, { status: string; invoiceNumber: string }> = {};
  for (const row of result.rows) {
    map[String(row.deal_id)] = {
      status: String(row.status),
      invoiceNumber: String(row.invoice_number),
    };
  }
  return map;
}
