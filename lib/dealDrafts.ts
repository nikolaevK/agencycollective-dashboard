import { randomUUID } from "crypto";
import type { Row } from "@libsql/client";
import { getDb, ensureMigrated } from "./db";
import type { DealDraftFields } from "./dealDraftFields";
import type { InvoiceSpec } from "./invoice/invoiceSpec";
import type { DraftSource } from "./invoiceDrafts";

/**
 * Deal drafts — a proposed deal awaiting a person's approval (typically
 * created by an agent through the v1 API / MCP). A pending draft is NOT a
 * deal: it never appears in deal lists, metrics, payouts, commissions or GHL.
 * Approval (lib/dealDraftApproval.ts) runs the normal creation path and stamps
 * `dealId`; from then on it is an ordinary deal, and its generated invoice is
 * an ordinary "Needs review" draft in the Deal queue.
 *
 *   pending  — awaiting review (editable by its author or a reviewer)
 *   approved — a person approved it; `dealId` is the created deal (terminal)
 *   rejected — a person declined it, with an optional note (terminal)
 */
export type DealDraftStatus = "pending" | "approved" | "rejected";
export const DEAL_DRAFT_REVIEW_STATUSES: DealDraftStatus[] = ["pending", "approved", "rejected"];

export interface DealDraft {
  id: string;
  fields: DealDraftFields;
  /** Proposed invoice changes over the generated deal invoice (or null). */
  invoice: InvoiceSpec | null;
  note: string | null;
  status: DealDraftStatus;
  source: DraftSource;
  createdBy: string | null;
  createdByName: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  dealId: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function str(v: unknown): string | null {
  return v == null ? null : String(v);
}

function rowToDraft(r: Row): DealDraft {
  const fields = parseJson<DealDraftFields>(r.fields, {} as DealDraftFields);
  return {
    id: String(r.id),
    // The denormalized columns are authoritative for list filters; keep the
    // payload consistent with them.
    fields: {
      ...fields,
      closerId: String(r.closer_id),
      clientName: String(r.client_name),
      dealValue: Number(r.deal_value ?? 0),
      additionalCcEmails: Array.isArray(fields.additionalCcEmails) ? fields.additionalCcEmails : [],
    },
    invoice: parseJson<InvoiceSpec | null>(r.invoice_spec, null),
    note: str(r.note),
    status: String(r.status) as DealDraftStatus,
    source: r.source === "dashboard" ? "dashboard" : "api",
    createdBy: str(r.created_by),
    createdByName: str(r.created_by_name),
    reviewedBy: str(r.reviewed_by),
    reviewedByName: str(r.reviewed_by_name),
    reviewedAt: str(r.reviewed_at),
    reviewNote: str(r.review_note),
    dealId: str(r.deal_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export interface CreateDealDraftInput {
  fields: DealDraftFields;
  invoice: InvoiceSpec | null;
  note: string | null;
  source: DraftSource;
  createdBy: string | null;
  createdByName: string | null;
}

export async function createDealDraft(input: CreateDealDraftInput): Promise<DealDraft> {
  await ensureMigrated();
  const id = randomUUID();
  const now = new Date().toISOString();
  await getDb().execute({
    sql: `INSERT INTO deal_drafts (
            id, closer_id, client_name, deal_value, fields, invoice_spec, note,
            status, source, created_by, created_by_name, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.fields.closerId,
      input.fields.clientName,
      input.fields.dealValue,
      JSON.stringify(input.fields),
      input.invoice ? JSON.stringify(input.invoice) : null,
      input.note,
      input.source,
      input.createdBy,
      input.createdByName,
      now,
      now,
    ],
  });
  return (await getDealDraft(id))!;
}

export async function getDealDraft(id: string): Promise<DealDraft | null> {
  await ensureMigrated();
  const res = await getDb().execute({ sql: "SELECT * FROM deal_drafts WHERE id = ?", args: [id] });
  return res.rows[0] ? rowToDraft(res.rows[0]) : null;
}

export interface ListDealDraftsFilter {
  status?: DealDraftStatus;
  closerId?: string;
  /** Only drafts credited to one of these closers (API resource scoping) —
   *  applied in SQL so pagination and totals count only visible drafts. */
  closerIds?: string[];
}

function dealDraftWhere(filter: ListDealDraftsFilter): { sql: string; args: string[] } {
  const where: string[] = [];
  const args: string[] = [];
  if (filter.status) { where.push("status = ?"); args.push(filter.status); }
  if (filter.closerId) { where.push("closer_id = ?"); args.push(filter.closerId); }
  if (filter.closerIds) {
    where.push(filter.closerIds.length ? `closer_id IN (${filter.closerIds.map(() => "?").join(",")})` : "0");
    args.push(...filter.closerIds);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}

export async function listDealDrafts(
  filter: ListDealDraftsFilter & { limit?: number; offset?: number } = {}
): Promise<DealDraft[]> {
  await ensureMigrated();
  const { sql, args } = dealDraftWhere(filter);
  const res = await getDb().execute({
    sql: `SELECT * FROM deal_drafts ${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    args: [...args, Math.min(Math.max(1, filter.limit ?? 500), 1000), Math.max(0, filter.offset ?? 0)],
  });
  return res.rows.map(rowToDraft);
}

export async function countDealDrafts(filter: ListDealDraftsFilter = {}): Promise<number> {
  await ensureMigrated();
  const { sql, args } = dealDraftWhere(filter);
  const res = await getDb().execute({ sql: `SELECT COUNT(*) AS n FROM deal_drafts ${sql}`, args });
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * Edit a PENDING draft. Returns null when it isn't pending (or doesn't exist),
 * or — with `expectedUpdatedAt` — when it changed since the caller loaded it.
 */
export async function updateDealDraft(
  id: string,
  patch: { fields?: DealDraftFields; invoice?: InvoiceSpec | null; note?: string | null },
  expectedUpdatedAt?: string
): Promise<DealDraft | null> {
  await ensureMigrated();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.fields) {
    sets.push("closer_id = ?", "client_name = ?", "deal_value = ?", "fields = ?");
    args.push(patch.fields.closerId, patch.fields.clientName, patch.fields.dealValue, JSON.stringify(patch.fields));
  }
  if (patch.invoice !== undefined) {
    sets.push("invoice_spec = ?");
    args.push(patch.invoice ? JSON.stringify(patch.invoice) : null);
  }
  if (patch.note !== undefined) { sets.push("note = ?"); args.push(patch.note); }
  if (sets.length === 0) return getDealDraft(id);
  sets.push("updated_at = ?");
  args.push(new Date().toISOString(), id);
  if (expectedUpdatedAt) args.push(expectedUpdatedAt);
  const res = await getDb().execute({
    sql: `UPDATE deal_drafts SET ${sets.join(", ")} WHERE id = ? AND status = 'pending'${
      expectedUpdatedAt ? " AND updated_at = ?" : ""
    }`,
    args,
  });
  if ((res.rowsAffected ?? 0) === 0) return null;
  return getDealDraft(id);
}

interface ReviewActor {
  reviewedBy: string;
  reviewedByName: string;
}

/**
 * Approve a pending draft and insert its deal in ONE transaction: the claim
 * (`UPDATE … WHERE status='pending' AND updated_at = <the version reviewed>`)
 * and the deal INSERT (conditional on that claim) commit together or not at
 * all — so a failed insert can't leave an "approved" draft pointing at a deal
 * that doesn't exist, and a retry can't create a second deal. Returns false
 * when another reviewer won, or the draft changed since `expectedUpdatedAt`.
 */
export async function approveDealDraftWithInsert(
  id: string,
  actor: ReviewActor & { dealId: string; note: string | null; expectedUpdatedAt: string },
  dealInsert: { columns: string; args: (string | number | null)[] }
): Promise<boolean> {
  await ensureMigrated();
  const now = new Date().toISOString();
  const results = await getDb().batch(
    [
      {
        sql: `UPDATE deal_drafts
              SET status = 'approved', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = ?,
                  review_note = ?, deal_id = ?, updated_at = ?
              WHERE id = ? AND status = 'pending' AND updated_at = ?`,
        args: [actor.reviewedBy, actor.reviewedByName, now, actor.note, actor.dealId, now, id, actor.expectedUpdatedAt],
      },
      {
        sql: `INSERT INTO deals (${dealInsert.columns})
              SELECT ${dealInsert.args.map(() => "?").join(", ")}
              WHERE EXISTS (SELECT 1 FROM deal_drafts WHERE id = ? AND status = 'approved' AND deal_id = ?)`,
        args: [...dealInsert.args, id, actor.dealId],
      },
    ],
    "write"
  );
  return (results[0]?.rowsAffected ?? 0) > 0;
}

export async function rejectDealDraft(id: string, actor: ReviewActor & { note: string | null }): Promise<boolean> {
  await ensureMigrated();
  const now = new Date().toISOString();
  const res = await getDb().execute({
    sql: `UPDATE deal_drafts
          SET status = 'rejected', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = ?,
              review_note = ?, updated_at = ?
          WHERE id = ? AND status = 'pending'`,
    args: [actor.reviewedBy, actor.reviewedByName, now, actor.note, now, id],
  });
  return (res.rowsAffected ?? 0) > 0;
}

export async function deleteDealDraft(id: string, opts: { pendingOnly?: boolean } = {}): Promise<boolean> {
  await ensureMigrated();
  const res = await getDb().execute({
    sql: `DELETE FROM deal_drafts WHERE id = ?${opts.pendingOnly ? " AND status = 'pending'" : ""}`,
    args: [id],
  });
  return (res.rowsAffected ?? 0) > 0;
}
