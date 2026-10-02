import { randomUUID } from "crypto";
import type { Row } from "@libsql/client";
import { getDb, ensureMigrated } from "./db";
import { findUsersByIds } from "./users";
import type { InvoiceData, PaymentType } from "@/types/invoice";

/**
 * Invoice drafts — a prepared client re-bill or ad-account invoice awaiting a
 * human. Created by an agent (v1 / MCP) or by "Save draft" in a dashboard
 * drawer; a person opens it in the normal drawer, adjusts, and sends. Nothing
 * is emailed, filed or written to the billing ledger until then — the send
 * route stamps the draft `sent` with the resulting invoice record id.
 *
 *   pending  — awaiting review (editable by its author or a reviewer)
 *   sent     — a person reviewed and sent it (terminal)
 *   rejected — a person declined it, with an optional note (terminal)
 *
 * A send CLAIMS the pending draft before emailing (claimInvoiceDraftForSend):
 * the claim lives in reviewed_by/reviewed_at while status stays 'pending', and
 * expires after SEND_CLAIM_TTL_MS so a crashed send can't lock the draft for
 * good. While claimed, a second send, reject, edit or API delete is refused —
 * so two reviewers can't email the same draft twice. Claim fields are never
 * exposed on a pending row.
 */
export type InvoiceDraftKind = "client_rebill" | "ad_account";
export type InvoiceDraftStatus = "pending" | "sent" | "rejected";
export type DraftSource = "api" | "dashboard";

export const INVOICE_DRAFT_KINDS: InvoiceDraftKind[] = ["client_rebill", "ad_account"];
export const INVOICE_DRAFT_STATUSES: InvoiceDraftStatus[] = ["pending", "sent", "rejected"];

/** Ad-account invoice inputs the drawer needs to re-open the draft faithfully. */
export interface InvoiceDraftOptions {
  retainerCents?: number;
  spendCents?: number;
  feeBps?: number;
  /** Billing cycle the invoice covers; null = the account's next cycle. */
  cycleAnchor?: string | null;
  /** Ids of the two generated lines (retainer / ad-spend fee) inside
   *  invoiceData, so the drawer re-opens them as the computed lines instead of
   *  duplicating them as extras. */
  lineIds?: { retainer: string; adSpend: string };
  /** Saved agency-profile style (dashboard drafts) — restores the email
   *  branding that matches the PDF when the draft is reopened. */
  styleProfileId?: string | null;
}

export interface InvoiceDraftSummary {
  id: string;
  kind: InvoiceDraftKind;
  userId: string | null;
  adAccountId: string | null;
  invoiceNumber: string;
  amountCents: number;
  recipientEmail: string | null;
  ccEmails: string[];
  paymentType: PaymentType;
  options: InvoiceDraftOptions;
  note: string | null;
  status: InvoiceDraftStatus;
  source: DraftSource;
  createdBy: string | null;
  createdByName: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  sentInvoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDraft extends InvoiceDraftSummary {
  invoiceData: InvoiceData;
}

// Every column except the (large) invoice_data — list reads never touch it.
const SUMMARY_COLS = `id, kind, user_id, ad_account_id, invoice_number, amount_cents,
  recipient_email, cc_emails, payment_type, options, note, status, source,
  created_by, created_by_name, reviewed_by, reviewed_by_name, reviewed_at,
  review_note, sent_invoice_id, created_at, updated_at`;

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

function rowToSummary(r: Row): InvoiceDraftSummary {
  // A pending row's reviewed_* columns hold an in-flight send claim, not a review.
  const reviewed = r.status !== "pending";
  return {
    id: String(r.id),
    kind: String(r.kind) as InvoiceDraftKind,
    userId: str(r.user_id),
    adAccountId: str(r.ad_account_id),
    invoiceNumber: String(r.invoice_number),
    amountCents: Number(r.amount_cents ?? 0),
    recipientEmail: str(r.recipient_email),
    ccEmails: parseJson<string[]>(r.cc_emails, []),
    paymentType: r.payment_type === "international" ? "international" : "local",
    options: parseJson<InvoiceDraftOptions>(r.options, {}),
    note: str(r.note),
    status: String(r.status) as InvoiceDraftStatus,
    source: r.source === "dashboard" ? "dashboard" : "api",
    createdBy: str(r.created_by),
    createdByName: str(r.created_by_name),
    reviewedBy: reviewed ? str(r.reviewed_by) : null,
    reviewedByName: reviewed ? str(r.reviewed_by_name) : null,
    reviewedAt: reviewed ? str(r.reviewed_at) : null,
    reviewNote: str(r.review_note),
    sentInvoiceId: str(r.sent_invoice_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowToDraft(r: Row): InvoiceDraft {
  return { ...rowToSummary(r), invoiceData: parseJson<InvoiceData>(r.invoice_data, null as unknown as InvoiceData) };
}

/** Amount the draft bills, in cents (the invoice's computed total). */
export function draftAmountCents(data: InvoiceData): number {
  return Math.max(0, Math.round((data.details.totalAmount ?? 0) * 100));
}

export interface CreateInvoiceDraftInput {
  kind: InvoiceDraftKind;
  userId: string | null;
  adAccountId: string | null;
  invoiceData: InvoiceData;
  recipientEmail: string | null;
  ccEmails: string[];
  paymentType: PaymentType;
  options: InvoiceDraftOptions;
  note: string | null;
  source: DraftSource;
  createdBy: string | null;
  createdByName: string | null;
}

export async function createInvoiceDraft(input: CreateInvoiceDraftInput): Promise<InvoiceDraft> {
  await ensureMigrated();
  const id = randomUUID();
  const now = new Date().toISOString();
  await getDb().execute({
    sql: `INSERT INTO invoice_drafts (
            id, kind, user_id, ad_account_id, invoice_number, amount_cents,
            recipient_email, cc_emails, payment_type, options, note, status,
            source, created_by, created_by_name, created_at, updated_at, invoice_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.kind,
      input.userId,
      input.adAccountId,
      input.invoiceData.details.invoiceNumber,
      draftAmountCents(input.invoiceData),
      input.recipientEmail,
      JSON.stringify(input.ccEmails),
      input.paymentType,
      JSON.stringify(input.options),
      input.note,
      input.source,
      input.createdBy,
      input.createdByName,
      now,
      now,
      JSON.stringify(input.invoiceData),
    ],
  });
  return (await getInvoiceDraft(id))!;
}

export async function getInvoiceDraft(id: string): Promise<InvoiceDraft | null> {
  await ensureMigrated();
  const res = await getDb().execute({
    sql: `SELECT ${SUMMARY_COLS}, invoice_data FROM invoice_drafts WHERE id = ?`,
    args: [id],
  });
  return res.rows[0] ? rowToDraft(res.rows[0]) : null;
}

export interface ListInvoiceDraftsFilter {
  status?: InvoiceDraftStatus;
  kind?: InvoiceDraftKind;
  /** Drafts whose target the client owns NOW — an ad-account draft follows
   *  its account's current owner, not the client it was drafted under. */
  ownerUserId?: string;
  adAccountId?: string;
}

export type InvoiceDraftListRow = InvoiceDraftSummary & { clientName: string | null; accountName: string | null };

/**
 * Drafts the caller may see, newest first, with the page cut AFTER the
 * visibility filter. Visibility depends on each draft's CURRENT target
 * (owner / workspace), so it's resolved in code over the cheap key columns;
 * only the requested page's summaries are then read. (Capping the fetch first
 * hid a scoped caller's older drafts and mis-counted the total.) Drafts whose
 * target no longer exists are omitted.
 */
export async function listVisibleInvoiceDrafts(
  filter: ListInvoiceDraftsFilter,
  visible: (target: InvoiceDraftTarget) => boolean,
  page: { limit: number; offset: number }
): Promise<{ items: InvoiceDraftListRow[]; total: number }> {
  await ensureMigrated();
  const db = getDb();
  const where: string[] = [];
  const args: string[] = [];
  if (filter.status) { where.push("status = ?"); args.push(filter.status); }
  if (filter.kind) { where.push("kind = ?"); args.push(filter.kind); }
  if (filter.adAccountId) { where.push("ad_account_id = ?"); args.push(filter.adAccountId); }
  const keys = await db.execute({
    sql: `SELECT id, kind, user_id, ad_account_id FROM invoice_drafts
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY created_at DESC`,
    args,
  });
  const keyRows: DraftKey[] = keys.rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind) as InvoiceDraftKind,
    userId: str(r.user_id),
    adAccountId: str(r.ad_account_id),
  }));
  const targets = await resolveInvoiceDraftTargets(keyRows);
  const matching = keyRows.filter((k) => {
    const t = targets.get(k.id);
    if (!t || !visible(t)) return false;
    return !filter.ownerUserId || t.ownerUserId === filter.ownerUserId;
  });
  const pageIds = matching.slice(page.offset, page.offset + page.limit).map((k) => k.id);
  if (pageIds.length === 0) return { items: [], total: matching.length };

  const res = await db.execute({
    sql: `SELECT ${SUMMARY_COLS} FROM invoice_drafts WHERE id IN (${pageIds.map(() => "?").join(",")})`,
    args: pageIds,
  });
  const byId = new Map(res.rows.map((r) => [String(r.id), rowToSummary(r)]));
  const items: InvoiceDraftListRow[] = [];
  for (const id of pageIds) {
    const d = byId.get(id);
    const t = targets.get(id);
    if (d && t) items.push({ ...d, clientName: t.clientName, accountName: t.accountName });
  }
  return { items, total: matching.length };
}

export interface UpdateInvoiceDraftInput {
  invoiceData?: InvoiceData;
  recipientEmail?: string | null;
  ccEmails?: string[];
  paymentType?: PaymentType;
  options?: InvoiceDraftOptions;
  note?: string | null;
}

/** Edit a PENDING draft. Returns null when it isn't pending (or doesn't exist). */
export async function updateInvoiceDraft(id: string, patch: UpdateInvoiceDraftInput): Promise<InvoiceDraft | null> {
  await ensureMigrated();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.invoiceData) {
    sets.push("invoice_data = ?", "invoice_number = ?", "amount_cents = ?");
    args.push(
      JSON.stringify(patch.invoiceData),
      patch.invoiceData.details.invoiceNumber,
      draftAmountCents(patch.invoiceData)
    );
  }
  if (patch.recipientEmail !== undefined) { sets.push("recipient_email = ?"); args.push(patch.recipientEmail); }
  if (patch.ccEmails) { sets.push("cc_emails = ?"); args.push(JSON.stringify(patch.ccEmails)); }
  if (patch.paymentType) { sets.push("payment_type = ?"); args.push(patch.paymentType); }
  if (patch.options) { sets.push("options = ?"); args.push(JSON.stringify(patch.options)); }
  if (patch.note !== undefined) { sets.push("note = ?"); args.push(patch.note); }
  if (sets.length === 0) return getInvoiceDraft(id);
  sets.push("updated_at = ?");
  args.push(new Date().toISOString(), id);
  const res = await getDb().execute({
    sql: `UPDATE invoice_drafts SET ${sets.join(", ")} WHERE id = ? AND status = 'pending' AND ${NOT_CLAIMED}`,
    args: [...args, claimCutoff()],
  });
  if ((res.rowsAffected ?? 0) === 0) return null;
  return getInvoiceDraft(id);
}

interface ReviewActor {
  reviewedBy: string;
  reviewedByName: string;
}

/** How long a send holds a draft — well past the send routes' 30s maxDuration. */
const SEND_CLAIM_TTL_MS = 2 * 60_000;
/** Pending and not held by an in-flight send (bind `claimCutoff()`). */
const NOT_CLAIMED = "(reviewed_at IS NULL OR reviewed_at < ?)";

function claimCutoff(): string {
  return new Date(Date.now() - SEND_CLAIM_TTL_MS).toISOString();
}

/**
 * Claim a pending draft for sending, BEFORE the email goes out. Exactly one
 * concurrent sender wins; returns the claim token (pass it to
 * releaseInvoiceDraftClaim if the email fails), or null when the draft was
 * already sent/rejected or another send holds it.
 */
export async function claimInvoiceDraftForSend(id: string, actor: ReviewActor): Promise<string | null> {
  await ensureMigrated();
  const token = new Date().toISOString();
  const res = await getDb().execute({
    sql: `UPDATE invoice_drafts SET reviewed_by = ?, reviewed_by_name = ?, reviewed_at = ?
          WHERE id = ? AND status = 'pending' AND ${NOT_CLAIMED}`,
    args: [actor.reviewedBy, actor.reviewedByName, token, id, claimCutoff()],
  });
  return (res.rowsAffected ?? 0) > 0 ? token : null;
}

/** Undo a send claim (the email didn't go out) so the draft can be sent again. */
export async function releaseInvoiceDraftClaim(id: string, token: string): Promise<void> {
  await getDb().execute({
    sql: `UPDATE invoice_drafts SET reviewed_by = NULL, reviewed_by_name = NULL, reviewed_at = NULL
          WHERE id = ? AND status = 'pending' AND reviewed_at = ?`,
    args: [id, token],
  });
}

/** Why a pending-only write was refused — for the 409 message. */
export async function invoiceDraftConflictMessage(id: string): Promise<string> {
  const res = await getDb().execute({
    sql: "SELECT status, reviewed_at FROM invoice_drafts WHERE id = ?",
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return "Draft not found";
  if (r.status !== "pending") return `This draft was already ${String(r.status)}`;
  return "This draft is being sent right now";
}

/**
 * Stamp a pending draft as sent (called by the send routes AFTER the email
 * went out), recording what actually went out — the reviewer may have changed
 * the amount, number or recipients in the drawer without re-saving the draft.
 * Conditional on `pending`, so a double send can't double-stamp.
 */
export async function markInvoiceDraftSent(
  id: string,
  actor: ReviewActor & {
    sentInvoiceId: string | null;
    amountCents: number;
    invoiceNumber: string;
    recipientEmail: string;
    ccEmails: string[];
  }
): Promise<boolean> {
  await ensureMigrated();
  const now = new Date().toISOString();
  const res = await getDb().execute({
    sql: `UPDATE invoice_drafts
          SET status = 'sent', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = ?,
              sent_invoice_id = ?, amount_cents = ?, invoice_number = ?,
              recipient_email = ?, cc_emails = ?, updated_at = ?
          WHERE id = ? AND status = 'pending'`,
    args: [
      actor.reviewedBy,
      actor.reviewedByName,
      now,
      actor.sentInvoiceId,
      actor.amountCents,
      actor.invoiceNumber,
      actor.recipientEmail,
      JSON.stringify(actor.ccEmails),
      now,
      id,
    ],
  });
  return (res.rowsAffected ?? 0) > 0;
}

export async function rejectInvoiceDraft(id: string, actor: ReviewActor & { note: string | null }): Promise<boolean> {
  await ensureMigrated();
  const now = new Date().toISOString();
  const res = await getDb().execute({
    sql: `UPDATE invoice_drafts
          SET status = 'rejected', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = ?,
              review_note = ?, updated_at = ?
          WHERE id = ? AND status = 'pending' AND ${NOT_CLAIMED}`,
    args: [actor.reviewedBy, actor.reviewedByName, now, actor.note, now, id, claimCutoff()],
  });
  return (res.rowsAffected ?? 0) > 0;
}

/** Delete a draft. `pendingOnly` keeps reviewed (and in-flight) drafts for API callers. */
export async function deleteInvoiceDraft(id: string, opts: { pendingOnly?: boolean } = {}): Promise<boolean> {
  await ensureMigrated();
  const res = await getDb().execute({
    sql: `DELETE FROM invoice_drafts WHERE id = ?${opts.pendingOnly ? ` AND status = 'pending' AND ${NOT_CLAIMED}` : ""}`,
    args: opts.pendingOnly ? [id, claimCutoff()] : [id],
  });
  return (res.rowsAffected ?? 0) > 0;
}

export interface InvoiceDraftTarget {
  /** Client display name (re-bill) / the account's client (ad account). */
  clientName: string | null;
  accountName: string | null;
  /** Workspace ("book") the target lives in — drives scoping. */
  workspace: string;
  /** The client that owns the target NOW (resource scoping for API tokens). */
  ownerUserId: string | null;
}

/**
 * Resolve each draft's target (client / ad account) name + workspace in two
 * point-lookup queries. A draft whose target no longer exists is omitted —
 * callers treat it as out of scope.
 */
type DraftKey = Pick<InvoiceDraftSummary, "id" | "kind" | "userId" | "adAccountId">;

export async function resolveInvoiceDraftTargets(
  drafts: DraftKey[]
): Promise<Map<string, InvoiceDraftTarget>> {
  await ensureMigrated();
  const db = getDb();
  const out = new Map<string, InvoiceDraftTarget>();
  const accountIds = Array.from(new Set(drafts.map((d) => d.adAccountId).filter((v): v is string => !!v)));
  const accounts = new Map<string, { name: string; workspace: string; userId: string | null }>();
  if (accountIds.length > 0) {
    const res = await db.execute({
      sql: `SELECT id, account_name, workspace, user_id FROM ad_accounts WHERE id IN (${accountIds.map(() => "?").join(",")})`,
      args: accountIds,
    });
    for (const r of res.rows) {
      accounts.set(String(r.id), {
        name: String(r.account_name ?? ""),
        workspace: String(r.workspace || "main"),
        userId: str(r.user_id),
      });
    }
  }

  // Draft clients + the CURRENT owners of drafted ad accounts.
  const userIds = Array.from(
    new Set(
      [...drafts.map((d) => d.userId), ...Array.from(accounts.values()).map((a) => a.userId)].filter(
        (v): v is string => !!v
      )
    )
  );
  // Via findUsersByIds (logo-free covering index): `workspace` is stored
  // after the logo BLOB, so a plain projection walks every row's overflow pages.
  const users = new Map<string, { name: string; workspace: string }>();
  for (const u of await findUsersByIds(userIds)) {
    users.set(u.id, { name: u.displayName, workspace: u.workspace });
  }

  for (const d of drafts) {
    if (d.kind === "ad_account") {
      const acct = d.adAccountId ? accounts.get(d.adAccountId) : undefined;
      if (!acct) continue;
      const owner = acct.userId ? users.get(acct.userId) : undefined;
      out.set(d.id, {
        clientName: owner?.name ?? null,
        accountName: acct.name,
        workspace: acct.workspace,
        ownerUserId: acct.userId,
      });
    } else {
      const user = d.userId ? users.get(d.userId) : undefined;
      if (!user) continue;
      out.set(d.id, { clientName: user.name, accountName: null, workspace: user.workspace, ownerUserId: d.userId });
    }
  }
  return out;
}
