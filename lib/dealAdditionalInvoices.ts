import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import type { InvoiceData } from "@/types/invoice";

export interface DealAdditionalInvoiceRecord {
  id: string;
  dealId: string;
  invoiceNumber: string;
  invoiceData: InvoiceData;
  status: "draft" | "sent";
  sortOrder: number;
  hasPdf: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToRecord(row: Row): DealAdditionalInvoiceRecord {
  return {
    id: String(row.id),
    dealId: String(row.deal_id),
    invoiceNumber: String(row.invoice_number),
    invoiceData: (() => { try { return JSON.parse(String(row.invoice_data)) as InvoiceData; } catch { return {} as InvoiceData; } })(),
    status: String(row.status) as "draft" | "sent",
    sortOrder: Number(row.sort_order ?? 0),
    hasPdf: row.pdf_data != null && row.pdf_data !== "",
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function findAdditionalInvoicesByDealId(dealId: string): Promise<DealAdditionalInvoiceRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM deal_additional_invoices WHERE deal_id = ? ORDER BY sort_order ASC, created_at ASC",
    args: [dealId],
  });
  return result.rows.map(rowToRecord);
}

export async function findAdditionalInvoice(id: string): Promise<DealAdditionalInvoiceRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM deal_additional_invoices WHERE id = ?", args: [id] });
  return result.rows[0] ? rowToRecord(result.rows[0]) : null;
}

export async function insertAdditionalInvoice(record: {
  id: string;
  dealId: string;
  invoiceNumber: string;
  invoiceData: string;
  status?: string;
  sortOrder?: number;
  createdBy?: string | null;
}): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO deal_additional_invoices (id, deal_id, invoice_number, invoice_data, status, sort_order, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.id,
      record.dealId,
      record.invoiceNumber,
      record.invoiceData,
      record.status ?? "draft",
      record.sortOrder ?? 0,
      record.createdBy ?? null,
    ],
  });
}

export async function updateAdditionalInvoice(
  id: string,
  changes: {
    invoiceData?: string;
    status?: string;
    sortOrder?: number;
    pdfData?: Buffer;
  }
): Promise<void> {
  const fields: string[] = [];
  const args: (string | number | Buffer | null)[] = [];

  if (changes.invoiceData !== undefined) { fields.push("invoice_data = ?"); args.push(changes.invoiceData); }
  if (changes.status !== undefined) { fields.push("status = ?"); args.push(changes.status); }
  if (changes.sortOrder !== undefined) { fields.push("sort_order = ?"); args.push(changes.sortOrder); }
  if (changes.pdfData !== undefined) { fields.push("pdf_data = ?"); args.push(changes.pdfData); }

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  args.push(id);

  await ensureMigrated();
  const db = getDb();
  await db.execute({ sql: `UPDATE deal_additional_invoices SET ${fields.join(", ")} WHERE id = ?`, args });
}

export async function deleteAdditionalInvoice(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM deal_additional_invoices WHERE id = ?", args: [id] });
  return (result.rowsAffected ?? 0) > 0;
}

export async function getAdditionalInvoicePdf(id: string): Promise<Buffer | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT pdf_data FROM deal_additional_invoices WHERE id = ?", args: [id] });
  const row = result.rows[0];
  if (!row || !row.pdf_data) return null;
  return Buffer.from(row.pdf_data as ArrayBuffer);
}

export async function countAdditionalInvoices(dealId: string): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT COUNT(*) as cnt FROM deal_additional_invoices WHERE deal_id = ?",
    args: [dealId],
  });
  return Number(result.rows[0]?.cnt ?? 0);
}
