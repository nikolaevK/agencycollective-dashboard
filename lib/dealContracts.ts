import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

export type DealContractStatus = "pending" | "sent" | "viewed" | "signed" | "expired" | "declined";

const VALID_STATUSES = new Set<string>(["pending", "sent", "viewed", "signed", "expired", "declined"]);

export interface DealContractRecord {
  id: string;
  dealId: string;
  contractTemplateId: string | null;
  docusealSubmissionId: number | null;
  docusealSubmitterId: number | null;
  status: DealContractStatus;
  clientEmail: string | null;
  signingUrl: string | null;
  sentAt: string | null;
  signedAt: string | null;
  documentUrls: string[] | null; // parsed JSON array of signed doc URLs
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToContract(row: Row): DealContractRecord {
  let documentUrls: string[] | null = null;
  if (row.document_urls) {
    try {
      documentUrls = JSON.parse(String(row.document_urls));
    } catch {
      documentUrls = null;
    }
  }

  return {
    id: String(row.id),
    dealId: String(row.deal_id),
    contractTemplateId: row.contract_template_id != null ? String(row.contract_template_id) : null,
    docusealSubmissionId: row.docuseal_submission_id != null ? Number(row.docuseal_submission_id) : null,
    docusealSubmitterId: row.docuseal_submitter_id != null ? Number(row.docuseal_submitter_id) : null,
    status: VALID_STATUSES.has(String(row.status)) ? (String(row.status) as DealContractStatus) : "pending",
    clientEmail: row.client_email != null ? String(row.client_email) : null,
    signingUrl: row.signing_url != null ? String(row.signing_url) : null,
    sentAt: row.sent_at != null ? String(row.sent_at) : null,
    signedAt: row.signed_at != null ? String(row.signed_at) : null,
    documentUrls,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function findDealContractByDealId(dealId: string): Promise<DealContractRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM deal_contracts WHERE deal_id = ?", args: [dealId] });
  return result.rows[0] ? rowToContract(result.rows[0]) : null;
}

export async function findDealContract(id: string): Promise<DealContractRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM deal_contracts WHERE id = ?", args: [id] });
  return result.rows[0] ? rowToContract(result.rows[0]) : null;
}

export async function insertDealContract(record: {
  id: string;
  dealId: string;
  contractTemplateId?: string | null;
  docusealSubmissionId?: number | null;
  docusealSubmitterId?: number | null;
  status?: DealContractStatus;
  clientEmail?: string | null;
  signingUrl?: string | null;
  sentAt?: string | null;
  createdBy?: string | null;
}): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO deal_contracts (id, deal_id, contract_template_id, docuseal_submission_id, docuseal_submitter_id, status, client_email, signing_url, sent_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.id,
      record.dealId,
      record.contractTemplateId ?? null,
      record.docusealSubmissionId ?? null,
      record.docusealSubmitterId ?? null,
      record.status ?? "pending",
      record.clientEmail ?? null,
      record.signingUrl ?? null,
      record.sentAt ?? null,
      record.createdBy ?? null,
    ],
  });
}

export async function updateDealContract(
  id: string,
  changes: {
    status?: DealContractStatus;
    signingUrl?: string | null;
    sentAt?: string | null;
    signedAt?: string | null;
    documentUrls?: string[] | null;
    docusealSubmissionId?: number | null;
    docusealSubmitterId?: number | null;
    clientEmail?: string | null;
    contractTemplateId?: string | null;
  }
): Promise<void> {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (changes.status !== undefined) { fields.push("status = ?"); args.push(changes.status); }
  if (changes.contractTemplateId !== undefined) { fields.push("contract_template_id = ?"); args.push(changes.contractTemplateId); }
  if (changes.signingUrl !== undefined) { fields.push("signing_url = ?"); args.push(changes.signingUrl); }
  if (changes.sentAt !== undefined) { fields.push("sent_at = ?"); args.push(changes.sentAt); }
  if (changes.signedAt !== undefined) { fields.push("signed_at = ?"); args.push(changes.signedAt); }
  if (changes.documentUrls !== undefined) { fields.push("document_urls = ?"); args.push(changes.documentUrls ? JSON.stringify(changes.documentUrls) : null); }
  if (changes.docusealSubmissionId !== undefined) { fields.push("docuseal_submission_id = ?"); args.push(changes.docusealSubmissionId); }
  if (changes.docusealSubmitterId !== undefined) { fields.push("docuseal_submitter_id = ?"); args.push(changes.docusealSubmitterId); }
  if (changes.clientEmail !== undefined) { fields.push("client_email = ?"); args.push(changes.clientEmail); }

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  args.push(id);

  await ensureMigrated();
  const db = getDb();
  await db.execute({ sql: `UPDATE deal_contracts SET ${fields.join(", ")} WHERE id = ?`, args });
}

export async function deleteDealContract(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM deal_contracts WHERE id = ?", args: [id] });
  return (result.rowsAffected ?? 0) > 0;
}

/** Batch fetch contract statuses for a list of deal IDs. */
export async function getDealContractStatuses(
  dealIds: string[]
): Promise<Record<string, { status: DealContractStatus; signingUrl: string | null }>> {
  if (dealIds.length === 0) return {};
  const capped = dealIds.slice(0, 500);
  await ensureMigrated();
  const db = getDb();
  const placeholders = capped.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT deal_id, status, signing_url FROM deal_contracts WHERE deal_id IN (${placeholders})`,
    args: capped,
  });
  const map: Record<string, { status: DealContractStatus; signingUrl: string | null }> = {};
  for (const row of result.rows) {
    map[String(row.deal_id)] = {
      status: VALID_STATUSES.has(String(row.status)) ? (String(row.status) as DealContractStatus) : "pending",
      signingUrl: row.signing_url != null ? String(row.signing_url) : null,
    };
  }
  return map;
}

/** Find contract by DocuSeal submission ID (used by webhooks). */
export async function findDealContractBySubmissionId(submissionId: number): Promise<DealContractRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM deal_contracts WHERE docuseal_submission_id = ?",
    args: [submissionId],
  });
  return result.rows[0] ? rowToContract(result.rows[0]) : null;
}
