import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import type { DealContractStatus } from "./dealContracts";

const VALID_STATUSES = new Set<string>(["pending", "sent", "viewed", "signed", "expired", "declined"]);

export interface DealAdditionalContractRecord {
  id: string;
  dealId: string;
  contractTemplateId: string | null;
  docusealSubmissionId: number | null;
  docusealSubmitterId: number | null;
  docusealTemplateOverrideId: number | null;
  status: DealContractStatus;
  clientEmail: string | null;
  signingUrl: string | null;
  sentAt: string | null;
  signedAt: string | null;
  documentUrls: string[] | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToRecord(row: Row): DealAdditionalContractRecord {
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
    docusealTemplateOverrideId: row.docuseal_template_override_id != null ? Number(row.docuseal_template_override_id) : null,
    status: VALID_STATUSES.has(String(row.status)) ? (String(row.status) as DealContractStatus) : "pending",
    clientEmail: row.client_email != null ? String(row.client_email) : null,
    signingUrl: row.signing_url != null ? String(row.signing_url) : null,
    sentAt: row.sent_at != null ? String(row.sent_at) : null,
    signedAt: row.signed_at != null ? String(row.signed_at) : null,
    documentUrls,
    sortOrder: Number(row.sort_order ?? 0),
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function findAdditionalContractsByDealId(dealId: string): Promise<DealAdditionalContractRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM deal_additional_contracts WHERE deal_id = ? ORDER BY sort_order ASC, created_at ASC",
    args: [dealId],
  });
  return result.rows.map(rowToRecord);
}

export async function findAdditionalContract(id: string): Promise<DealAdditionalContractRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM deal_additional_contracts WHERE id = ?", args: [id] });
  return result.rows[0] ? rowToRecord(result.rows[0]) : null;
}

export async function insertAdditionalContract(record: {
  id: string;
  dealId: string;
  contractTemplateId?: string | null;
  sortOrder?: number;
  createdBy?: string | null;
}): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO deal_additional_contracts (id, deal_id, contract_template_id, sort_order, created_by)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      record.id,
      record.dealId,
      record.contractTemplateId ?? null,
      record.sortOrder ?? 0,
      record.createdBy ?? null,
    ],
  });
}

export async function updateAdditionalContract(
  id: string,
  changes: {
    status?: DealContractStatus;
    contractTemplateId?: string | null;
    docusealSubmissionId?: number | null;
    docusealSubmitterId?: number | null;
    docusealTemplateOverrideId?: number | null;
    signingUrl?: string | null;
    sentAt?: string | null;
    signedAt?: string | null;
    documentUrls?: string[] | null;
    clientEmail?: string | null;
    sortOrder?: number;
  }
): Promise<void> {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (changes.status !== undefined) { fields.push("status = ?"); args.push(changes.status); }
  if (changes.contractTemplateId !== undefined) { fields.push("contract_template_id = ?"); args.push(changes.contractTemplateId); }
  if (changes.docusealSubmissionId !== undefined) { fields.push("docuseal_submission_id = ?"); args.push(changes.docusealSubmissionId); }
  if (changes.docusealSubmitterId !== undefined) { fields.push("docuseal_submitter_id = ?"); args.push(changes.docusealSubmitterId); }
  if (changes.docusealTemplateOverrideId !== undefined) { fields.push("docuseal_template_override_id = ?"); args.push(changes.docusealTemplateOverrideId); }
  if (changes.signingUrl !== undefined) { fields.push("signing_url = ?"); args.push(changes.signingUrl); }
  if (changes.sentAt !== undefined) { fields.push("sent_at = ?"); args.push(changes.sentAt); }
  if (changes.signedAt !== undefined) { fields.push("signed_at = ?"); args.push(changes.signedAt); }
  if (changes.documentUrls !== undefined) { fields.push("document_urls = ?"); args.push(changes.documentUrls ? JSON.stringify(changes.documentUrls) : null); }
  if (changes.clientEmail !== undefined) { fields.push("client_email = ?"); args.push(changes.clientEmail); }
  if (changes.sortOrder !== undefined) { fields.push("sort_order = ?"); args.push(changes.sortOrder); }

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  args.push(id);

  await ensureMigrated();
  const db = getDb();
  await db.execute({ sql: `UPDATE deal_additional_contracts SET ${fields.join(", ")} WHERE id = ?`, args });
}

export async function deleteAdditionalContract(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM deal_additional_contracts WHERE id = ?", args: [id] });
  return (result.rowsAffected ?? 0) > 0;
}

export async function countAdditionalContracts(dealId: string): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT COUNT(*) as cnt FROM deal_additional_contracts WHERE deal_id = ?",
    args: [dealId],
  });
  return Number(result.rows[0]?.cnt ?? 0);
}

export async function findAdditionalContractBySubmissionId(submissionId: number): Promise<DealAdditionalContractRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM deal_additional_contracts WHERE docuseal_submission_id = ?",
    args: [submissionId],
  });
  return result.rows[0] ? rowToRecord(result.rows[0]) : null;
}
