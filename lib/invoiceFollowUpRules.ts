import { isValidEmail, normalizeCcList, DEFAULT_MAX_CC } from "./invoice/email";

// ---------------------------------------------------------------------------
// Follow-ups on a sent invoice — the PURE rules (types, validation, helpers).
// No db imports: the dashboard UI reuses these. Persistence lives in
// lib/invoiceFollowUps.ts.
// ---------------------------------------------------------------------------

export type FollowUpInvoiceKind = "client_rebill" | "ad_account";

export type FollowUpChannel = "email" | "call" | "message" | "note";

export const FOLLOW_UP_CHANNELS: readonly FollowUpChannel[] = [
  "email",
  "call",
  "message",
  "note",
];

/** Max length of the personal message / logged note. */
export const FOLLOW_UP_MESSAGE_MAX = 2000;

/**
 * Minimum gap between two reminder EMAILS for the same invoice — a soft guard
 * against a double-click / second tab mailing the client twice.
 */
export const FOLLOW_UP_EMAIL_COOLDOWN_MS = 60_000;

export interface InvoiceFollowUp {
  id: string;
  invoiceKind: FollowUpInvoiceKind;
  invoiceId: string;
  channel: FollowUpChannel;
  recipientEmail: string | null;
  ccEmails: string[];
  message: string | null;
  /** Email follow-ups: whether the original invoice PDF was attached. */
  attachedPdf: boolean;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface FollowUpSummary {
  count: number;
  lastAt: string | null;
  lastChannel: FollowUpChannel | null;
}

export const EMPTY_FOLLOW_UP_SUMMARY: FollowUpSummary = {
  count: 0,
  lastAt: null,
  lastChannel: null,
};

/**
 * Only invoices still owed can be followed up: awaiting payment (`sent`) or an
 * admin-marked `unpaid` period that's being chased. Paid is settled and
 * superseded was replaced by a newer invoice (follow up on that one).
 */
export function canFollowUp(status: string): boolean {
  return status === "sent" || status === "unpaid";
}

// ---------------------------------------------------------------------------
// Input parsing (pure — shared by both routes, unit-tested)
// ---------------------------------------------------------------------------

export interface FollowUpInput {
  channel: FollowUpChannel;
  message: string | null;
  /** Email only: primary recipient (defaults to the invoice's). */
  recipientEmail: string | null;
  /** Email only: CC list, normalized + de-duped, primary excluded. */
  ccEmails: string[];
  /** Email only: re-attach the originally filed PDF. */
  attachPdf: boolean;
  /**
   * Email only: Agency Profile id to brand the reminder with. `undefined` =
   * use the original send's style; `null` = default Agency Collective.
   */
  styleProfileId: string | null | undefined;
}

/**
 * Validate a follow-up request body. `fallbackRecipient` is the invoice's
 * original recipient — an email follow-up without an explicit address goes
 * there. Returns a 400-ready error message on bad input.
 */
export function parseFollowUpInput(
  raw: unknown,
  fallbackRecipient: string | null
): { ok: true; value: FollowUpInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, error: "Invalid JSON body" };
  const body = raw as Record<string, unknown>;

  const channel = body.channel;
  if (typeof channel !== "string" || !FOLLOW_UP_CHANNELS.includes(channel as FollowUpChannel))
    return { ok: false, error: `channel must be one of ${FOLLOW_UP_CHANNELS.join(", ")}` };

  let message: string | null = null;
  if (body.message !== undefined && body.message !== null) {
    if (typeof body.message !== "string")
      return { ok: false, error: "message must be a string" };
    const trimmed = body.message.trim();
    if (trimmed.length > FOLLOW_UP_MESSAGE_MAX)
      return { ok: false, error: `message is limited to ${FOLLOW_UP_MESSAGE_MAX} characters` };
    message = trimmed || null;
  }

  if (channel !== "email") {
    // A logged touch is only useful with something to say.
    if (!message) return { ok: false, error: "A note is required for a logged follow-up" };
    return {
      ok: true,
      value: {
        channel: channel as FollowUpChannel,
        message,
        recipientEmail: null,
        ccEmails: [],
        attachPdf: false,
        styleProfileId: undefined,
      },
    };
  }

  // ── Email ────────────────────────────────────────────────────────────────
  let recipient: string | null = fallbackRecipient?.trim() || null;
  if (body.recipientEmail !== undefined && body.recipientEmail !== null && body.recipientEmail !== "") {
    if (typeof body.recipientEmail !== "string")
      return { ok: false, error: "recipientEmail must be a string" };
    recipient = body.recipientEmail.trim();
  }
  if (!recipient) return { ok: false, error: "A recipient email is required" };
  if (!isValidEmail(recipient)) return { ok: false, error: "Invalid recipient email" };

  let ccEmails: string[] = [];
  if (body.cc !== undefined && body.cc !== null) {
    if (!Array.isArray(body.cc) || body.cc.some((c) => typeof c !== "string"))
      return { ok: false, error: "cc must be an array of emails" };
    // Reject a bad address outright (normalizeCcList would silently drop it).
    for (const c of body.cc as string[]) {
      const v = c.trim();
      if (v && !isValidEmail(v))
        return { ok: false, error: `Invalid CC email: ${v.slice(0, 80)}` };
    }
    const list = normalizeCcList(body.cc as string[]);
    const primary = recipient.toLowerCase();
    ccEmails = list.filter((c) => c !== primary);
    if (ccEmails.length > DEFAULT_MAX_CC)
      return { ok: false, error: `At most ${DEFAULT_MAX_CC} CC recipients` };
  }

  let styleProfileId: string | null | undefined = undefined;
  if (body.styleProfileId !== undefined) {
    if (body.styleProfileId === null || body.styleProfileId === "") styleProfileId = null;
    else if (typeof body.styleProfileId === "string") styleProfileId = body.styleProfileId.trim();
    else return { ok: false, error: "styleProfileId must be a string or null" };
  }

  return {
    ok: true,
    value: {
      channel: "email",
      message,
      recipientEmail: recipient,
      ccEmails,
      attachPdf: body.attachPdf !== false,
      styleProfileId,
    },
  };
}

/** Whole days between an ISO timestamp and `now` (floored, never negative). */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}
