import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import { parseCcEmails } from "./clientRebillInvoices";
import { findDocumentWithData, type PayoutDocument } from "./payoutDocuments";
import {
  getAgencyProfileEmailBrand,
  type AgencyProfileEmailBrand,
} from "./invoiceAgencyProfiles";
import { isEmailConfigured, sendInvoiceFollowUpEmail } from "./invoice/emailService";
import {
  EMPTY_FOLLOW_UP_SUMMARY,
  FOLLOW_UP_CHANNELS,
  FOLLOW_UP_EMAIL_COOLDOWN_MS,
  canFollowUp,
  type FollowUpChannel,
  type FollowUpInput,
  type FollowUpInvoiceKind,
  type FollowUpSummary,
  type InvoiceFollowUp,
} from "./invoiceFollowUpRules";

export * from "./invoiceFollowUpRules";

// ---------------------------------------------------------------------------
// Follow-ups on a sent invoice (client re-bill OR ad-account).
//
// A follow-up chases payment on an invoice that already went out WITHOUT
// touching the invoice: no new invoice row, no supersede, no new number/PDF,
// sent_at / cycle / amount stay exactly as originally sent. Two kinds:
//   email   — a reminder emailed from the dashboard, re-attaching the PDF that
//             was filed at send time (payout_documents)
//   call | message | note — a touch made elsewhere, logged for the history
// Append-only (`invoice_followups`); the invoice's lifecycle (sent → paid,
// manual overrides) is unaffected and keeps running on its own.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

function rowToFollowUp(row: Row): InvoiceFollowUp {
  const channel = String(row.channel ?? "note");
  return {
    id: String(row.id),
    invoiceKind: String(row.invoice_kind) === "ad_account" ? "ad_account" : "client_rebill",
    invoiceId: String(row.invoice_id),
    channel: FOLLOW_UP_CHANNELS.includes(channel as FollowUpChannel)
      ? (channel as FollowUpChannel)
      : "note",
    recipientEmail: row.recipient_email != null ? String(row.recipient_email) : null,
    ccEmails: parseCcEmails(row.cc_emails),
    message: row.message != null ? String(row.message) : null,
    attachedPdf: Number(row.attached_pdf ?? 0) === 1,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdByName: row.created_by_name != null ? String(row.created_by_name) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

/** Every follow-up on one invoice, newest first. */
export async function listFollowUps(
  kind: FollowUpInvoiceKind,
  invoiceId: string
): Promise<InvoiceFollowUp[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM invoice_followups
          WHERE invoice_kind = ? AND invoice_id = ?
          ORDER BY created_at DESC`,
    args: [kind, invoiceId],
  });
  return result.rows.map(rowToFollowUp);
}

/**
 * Count + latest touch per invoice for a batch of invoice ids (one query).
 * Ids without follow-ups are absent from the map — callers default to
 * EMPTY_FOLLOW_UP_SUMMARY.
 */
export async function getFollowUpSummaries(
  kind: FollowUpInvoiceKind,
  invoiceIds: string[]
): Promise<Map<string, FollowUpSummary>> {
  const map = new Map<string, FollowUpSummary>();
  const ids = [...new Set(invoiceIds)];
  if (ids.length === 0) return map;
  await ensureMigrated();
  const db = getDb();
  // Chunked so a large history never approaches SQLite's bound-parameter cap.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const result = await db.execute({
      sql: `SELECT invoice_id, channel, created_at FROM invoice_followups
            WHERE invoice_kind = ? AND invoice_id IN (${chunk.map(() => "?").join(", ")})
            ORDER BY created_at DESC`,
      args: [kind, ...chunk],
    });
    for (const row of result.rows) {
      const id = String(row.invoice_id);
      const existing = map.get(id);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const channel = String(row.channel ?? "note");
      map.set(id, {
        count: 1,
        lastAt: String(row.created_at ?? "") || null,
        lastChannel: FOLLOW_UP_CHANNELS.includes(channel as FollowUpChannel)
          ? (channel as FollowUpChannel)
          : "note",
      });
    }
  }
  return map;
}

/**
 * Attach `followUps` (count + latest touch) to each invoice of a list — one
 * query for the whole list. Used by the admin list/panel routes.
 */
export async function withFollowUpSummaries<T extends { id: string }>(
  kind: FollowUpInvoiceKind,
  invoices: T[]
): Promise<Array<T & { followUps: FollowUpSummary }>> {
  const summaries = await getFollowUpSummaries(
    kind,
    invoices.map((i) => i.id)
  );
  return invoices.map((i) => ({
    ...i,
    followUps: summaries.get(i.id) ?? { ...EMPTY_FOLLOW_UP_SUMMARY },
  }));
}

/** Remove one follow-up row (rolls back a reminder reservation whose email failed). */
export async function deleteFollowUp(id: string): Promise<void> {
  await ensureMigrated();
  await getDb().execute({ sql: "DELETE FROM invoice_followups WHERE id = ?", args: [id] });
}

export interface CreateFollowUpInput {
  invoiceKind: FollowUpInvoiceKind;
  invoiceId: string;
  channel: FollowUpChannel;
  recipientEmail?: string | null;
  ccEmails?: string[];
  message?: string | null;
  attachedPdf?: boolean;
  createdBy: string | null;
  createdByName: string | null;
}

/**
 * Append one follow-up to an invoice's history. With `cooldownMs`, the insert
 * is ATOMICALLY refused (returns null) when an email follow-up for the same
 * invoice was recorded within that window — the reminder route reserves its
 * history row this way BEFORE emailing, so two tabs submitting at once can't
 * both mail the client.
 */
export async function createFollowUp(
  input: CreateFollowUpInput,
  opts: { cooldownMs?: number } = {}
): Promise<InvoiceFollowUp | null> {
  await ensureMigrated();
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const ccEmails = input.ccEmails ?? [];
  const values = [
    id,
    input.invoiceKind,
    input.invoiceId,
    input.channel,
    input.recipientEmail ?? null,
    ccEmails.length > 0 ? JSON.stringify(ccEmails) : null,
    input.message ?? null,
    input.attachedPdf ? 1 : 0,
    input.createdBy,
    input.createdByName,
    createdAt,
  ];
  const cols = `id, invoice_kind, invoice_id, channel, recipient_email, cc_emails,
            message, attached_pdf, created_by, created_by_name, created_at`;
  if (opts.cooldownMs) {
    const result = await db.execute({
      sql: `INSERT INTO invoice_followups (${cols})
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM invoice_followups
              WHERE invoice_kind = ? AND invoice_id = ? AND channel = 'email'
                AND created_at > ?
            )`,
      args: [
        ...values,
        input.invoiceKind,
        input.invoiceId,
        new Date(now - opts.cooldownMs).toISOString(),
      ],
    });
    if ((result.rowsAffected ?? 0) === 0) return null;
  } else {
    await db.execute({
      sql: `INSERT INTO invoice_followups (${cols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: values,
    });
  }
  return {
    id,
    invoiceKind: input.invoiceKind,
    invoiceId: input.invoiceId,
    channel: input.channel,
    recipientEmail: input.recipientEmail ?? null,
    ccEmails,
    message: input.message ?? null,
    attachedPdf: Boolean(input.attachedPdf),
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt,
  };
}

// ---------------------------------------------------------------------------
// Execute one follow-up (shared by the client re-bill + ad-account routes)
// ---------------------------------------------------------------------------

/** The slice of an invoice (either kind) a follow-up needs. */
export interface FollowUpTarget {
  kind: FollowUpInvoiceKind;
  id: string;
  status: string;
  invoiceNumber: string;
  amountCents: number;
  sentAt: string;
  styleProfileId: string | null;
  payoutDocumentId: string | null;
}

export type FollowUpResult =
  | { ok: true; followUp: InvoiceFollowUp }
  | { ok: false; status: number; error: string };

/**
 * Record — and for `email`, send — one follow-up on a sent invoice. Never
 * modifies the invoice row. `canAttach` is the caller's authorization of the
 * stored PDF (client: isDocumentVisibleToClient; ad account: actor's book) so
 * a document id on the row can't mail out a file the actor couldn't open.
 */
export async function recordInvoiceFollowUp(params: {
  target: FollowUpTarget;
  input: FollowUpInput;
  actor: { id: string; name: string };
  canAttach: (doc: PayoutDocument) => boolean;
}): Promise<FollowUpResult> {
  const { target, input, actor } = params;

  if (!canFollowUp(target.status))
    return {
      ok: false,
      status: 409,
      error: `Only invoices awaiting payment (or marked unpaid) can be followed up — this one is ${target.status}`,
    };

  if (input.channel !== "email") {
    const followUp = await createFollowUp({
      invoiceKind: target.kind,
      invoiceId: target.id,
      channel: input.channel,
      message: input.message,
      createdBy: actor.id,
      createdByName: actor.name,
    });
    return { ok: true, followUp: followUp! };
  }

  if (!isEmailConfigured())
    return { ok: false, status: 503, error: "Email not configured" };

  // Branding: the original send's style unless the admin picked one. A style
  // that no longer exists is refused rather than silently swapped for the
  // default — a wrongly-branded email to a client can't be taken back.
  const styleId =
    input.styleProfileId === undefined ? target.styleProfileId : input.styleProfileId;
  let brand: AgencyProfileEmailBrand | undefined;
  if (styleId) {
    const found = await getAgencyProfileEmailBrand(styleId);
    if (!found)
      return {
        ok: false,
        status: 400,
        error: "The invoice style used for this invoice no longer exists — choose another style",
      };
    brand = found;
  }

  let pdf: { buffer: Buffer; fileName: string } | null = null;
  if (input.attachPdf) {
    const found = target.payoutDocumentId
      ? await findDocumentWithData(target.payoutDocumentId)
      : null;
    if (!found || found.doc.docType !== "invoice" || !params.canAttach(found.doc))
      return {
        ok: false,
        status: 409,
        error:
          "The original invoice PDF isn't on file for this invoice — send the reminder without the attachment",
      };
    pdf = { buffer: found.fileData, fileName: found.doc.fileName };
  }

  // Reserve the history row FIRST (atomic cooldown — see createFollowUp),
  // then email; a failed send removes the reservation.
  const followUp = await createFollowUp(
    {
      invoiceKind: target.kind,
      invoiceId: target.id,
      channel: "email",
      recipientEmail: input.recipientEmail,
      ccEmails: input.ccEmails,
      message: input.message,
      attachedPdf: pdf !== null,
      createdBy: actor.id,
      createdByName: actor.name,
    },
    { cooldownMs: FOLLOW_UP_EMAIL_COOLDOWN_MS }
  );
  if (!followUp)
    return {
      ok: false,
      status: 429,
      error: "A reminder for this invoice was just sent — wait a minute before sending another",
    };

  let sent = false;
  try {
    sent = await sendInvoiceFollowUpEmail(input.recipientEmail!, {
      variant: target.kind === "ad_account" ? "adaccount" : "rebill",
      invoiceNumber: target.invoiceNumber,
      amountCents: target.amountCents,
      originalSentAt: target.sentAt,
      message: input.message,
      pdf,
      cc: input.ccEmails,
      brand,
    });
  } finally {
    if (!sent) {
      await deleteFollowUp(followUp.id).catch((err) =>
        console.error("[invoice-follow-up] reservation cleanup failed:", err)
      );
    }
  }
  if (!sent) return { ok: false, status: 502, error: "Failed to send the reminder email" };
  return { ok: true, followUp };
}
