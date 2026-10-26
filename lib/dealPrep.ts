import { waitUntil } from "@vercel/functions";
import { getDb, ensureMigrated, sqlIn } from "./db";
import { findDeal, type DealRecord } from "./deals";
import { getDealInvoiceStatuses } from "./dealInvoices";
import { sendPushToAllAdmins } from "./pushNotifications";
import { formatCentsExact } from "./format";
import { businessTodayYmd } from "./businessTime";
import { buildPaperworkSnapshot, loadDealPaperwork, upsertExemplar, type DealPaperwork } from "./dealPrepExemplars";
import { DEAL_PREP_SKIP_RULE } from "./dealPrepPrompts";
import {
  dealPrepInputHash,
  diffPaperwork,
  effectiveDealPrepStatus,
  isDealPrepStatus,
  isGeneratedPaperwork,
  paperworkChanged,
  parseJson,
  ymdDaysBefore,
  type DealPrepStatus,
  type PaperworkSnapshot,
} from "./dealPrepRules";

// ---------------------------------------------------------------------------
// Deal-prep agent lifecycle. An agent working through this app's MCP tools
// pre-builds a closed deal's paperwork IN PLACE — the deal's draft
// invoice(s) and pending contract scope(s) — and reports back with
// submitDealPrep. A person still reviews and sends; nothing here emails.
//
// Manual mode (default, no config): someone asks Claude (MCP connector →
// "prepare_deals" prompt) to prepare the deals awaiting prep — listDealPreps
// computes those from the deals themselves. Optional auto mode: a Claude Code
// routine is fired per deal (DEAL_PREP_ROUTINE_FIRE_URL + _TOKEN).
//
//   queued → dispatched → ready | needs_input      (agent reported)
//          ↘ failed (fire error / never reported)   → Re-run
//   deal inputs change → re-queued (one run at a time)
//   stale = a person edited the paperwork: the agent keeps its hands off
//           (re-queues, new runs) until a person asks for a re-run
//   invoice sent → `sent` (terminal) + an exemplar for future runs
// ---------------------------------------------------------------------------

export interface DealPrepFlag {
  severity: "info" | "warning" | "blocker";
  message: string;
}

export interface DealPrepRecord {
  dealId: string;
  status: DealPrepStatus;
  inputHash: string;
  reason: string | null;
  attempts: number;
  dispatchedAt: string | null;
  /** The current run passed its start gate (assertDealPreparable). */
  runStartedAt: string | null;
  finishedAt: string | null;
  sessionUrl: string | null;
  summary: string | null;
  flags: DealPrepFlag[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Routine trigger (claude.ai/code/routines → API trigger). Both or nothing. */
function routineConfig(): { url: string; token: string } | null {
  const url = process.env.DEAL_PREP_ROUTINE_FIRE_URL?.trim();
  const token = process.env.DEAL_PREP_ROUTINE_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

/** A routine trigger is configured — each queued deal starts a run by itself. */
export function isDealPrepAutoRun(): boolean {
  return routineConfig() !== null;
}

/**
 * Newly closed deals get a "queued" row (and badge) at once. Off in manual
 * mode: awaiting deals are computed instead, and a deal gets its row when the
 * agent first submits — from then on it is tracked either way.
 */
function autoQueues(): boolean {
  return routineConfig() !== null || process.env.DEAL_PREP_ENABLED === "1";
}

/** Closed deals awaiting their FIRST prep are listed from this far back (older drafts: ask for them by id). */
export const DEAL_PREP_BACKLOG_DAYS = 30;

function parseFlags(raw: unknown): DealPrepFlag[] {
  const v = parseJson<unknown>(raw);
  return Array.isArray(v) ? v.filter((f) => f && typeof f.message === "string") : [];
}

const PREP_COLS = `deal_id, status, input_hash, reason, attempts, dispatched_at, run_started_at, finished_at,
                   session_url, summary, flags, error, created_at, updated_at`;

function rowToPrep(row: Record<string, unknown>): DealPrepRecord {
  const status = String(row.status);
  return {
    dealId: String(row.deal_id),
    status: isDealPrepStatus(status) ? status : "queued",
    inputHash: String(row.input_hash ?? ""),
    reason: row.reason != null ? String(row.reason) : null,
    attempts: Number(row.attempts ?? 0),
    dispatchedAt: row.dispatched_at != null ? String(row.dispatched_at) : null,
    runStartedAt: row.run_started_at != null ? String(row.run_started_at) : null,
    finishedAt: row.finished_at != null ? String(row.finished_at) : null,
    sessionUrl: row.session_url != null ? String(row.session_url) : null,
    summary: row.summary != null ? String(row.summary) : null,
    flags: parseFlags(row.flags),
    error: row.error != null ? String(row.error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function findDealPrep(dealId: string): Promise<DealPrepRecord | null> {
  await ensureMigrated();
  const res = await getDb().execute({ sql: `SELECT ${PREP_COLS} FROM deal_agent_preps WHERE deal_id = ?`, args: [dealId] });
  return res.rows[0] ? rowToPrep(res.rows[0] as Record<string, unknown>) : null;
}

/** Prep as shown to people — a dispatched run past the stall window reads as failed. */
export function presentDealPrep(p: DealPrepRecord, nowMs = Date.now()): DealPrepRecord & { stalled: boolean } {
  const eff = effectiveDealPrepStatus(p, nowMs);
  return {
    ...p,
    status: eff.status,
    stalled: eff.stalled,
    error: eff.stalled ? "The agent run never reported back — re-run it." : p.error,
  };
}

/** Badge data for the Deal queue list (one query, sent preps omitted). */
export async function getDealPrepBadges(
  dealIds: string[]
): Promise<Record<string, { status: DealPrepStatus; flagCount: number; blocker: boolean }>> {
  if (dealIds.length === 0) return {};
  await ensureMigrated();
  const ids = sqlIn("deal_id", dealIds.slice(0, 500));
  const res = await getDb().execute({
    sql: `SELECT deal_id, status, dispatched_at, flags FROM deal_agent_preps WHERE ${ids.sql} AND status != 'sent'`,
    args: ids.args,
  });
  const now = Date.now();
  const out: Record<string, { status: DealPrepStatus; flagCount: number; blocker: boolean }> = {};
  for (const row of res.rows) {
    const raw = String(row.status);
    if (!isDealPrepStatus(raw)) continue;
    const eff = effectiveDealPrepStatus({ status: raw, dispatchedAt: row.dispatched_at != null ? String(row.dispatched_at) : null }, now);
    const flags = parseFlags(row.flags);
    out[String(row.deal_id)] = {
      status: eff.status,
      flagCount: flags.length,
      blocker: flags.some((f) => f.severity === "blocker"),
    };
  }
  return out;
}

type ListedPrep = DealPrepRecord & { stalled: boolean; clientName: string; dealValueCents: number; closerId: string };

/**
 * Closed deals with a draft invoice, closed in the last DEAL_PREP_BACKLOG_DAYS,
 * that the agent never prepared — shown as `queued` (manual mode's queue).
 */
async function awaitingFirstPrep(closerIds: string[] | null): Promise<ListedPrep[]> {
  const since = ymdDaysBefore(businessTodayYmd(), DEAL_PREP_BACKLOG_DAYS);
  const closer = closerIds ? sqlIn("d.closer_id", closerIds) : null;
  const rows = (
    await getDb().execute({
      sql: `SELECT d.id, d.client_name, d.deal_value, d.closer_id, d.created_at
            FROM deals d JOIN deal_invoices i ON i.deal_id = d.id
            WHERE d.status = 'closed' AND d.deal_value > 0 AND i.status = 'draft'
              AND COALESCE(d.closing_date, substr(d.created_at, 1, 10)) >= ?
              AND NOT EXISTS (SELECT 1 FROM deal_agent_preps p WHERE p.deal_id = d.id)
              ${closer ? `AND ${closer.sql}` : ""}`,
      args: [since, ...(closer?.args ?? [])],
    })
  ).rows;
  return rows.map((r) => ({
    dealId: String(r.id),
    status: "queued" as const,
    inputHash: "",
    reason: "awaiting first prep",
    attempts: 0,
    dispatchedAt: null,
    runStartedAt: null,
    finishedAt: null,
    sessionUrl: null,
    summary: null,
    flags: [],
    error: null,
    createdAt: String(r.created_at),
    updatedAt: String(r.created_at),
    stalled: false,
    clientName: String(r.client_name ?? ""),
    dealValueCents: Number(r.deal_value ?? 0),
    closerId: String(r.closer_id ?? ""),
  }));
}

/**
 * The prep queue. `queued` (and the unfiltered list) also includes closed
 * deals never prepared (awaitingFirstPrep); queued items come oldest first.
 */
export async function listDealPreps(opts: {
  status?: DealPrepStatus;
  closerIds?: string[] | null;
  limit: number;
  offset: number;
}): Promise<{ items: ListedPrep[]; total: number }> {
  await ensureMigrated();
  const closerIds = opts.closerIds ?? null;
  // SQL narrows; the shown status is decided after presentation (a stalled
  // dispatched run reads as failed).
  const stored = !opts.status ? null : opts.status === "failed" ? ["failed", "dispatched"] : [opts.status];
  const filters = [stored ? sqlIn("p.status", stored) : null, closerIds ? sqlIn("d.closer_id", closerIds) : null].filter(
    (f): f is { sql: string; args: string[] } => f !== null
  );
  const [tracked, awaiting] = await Promise.all([
    getDb().execute({
      sql: `SELECT ${PREP_COLS.split(",").map((c) => `p.${c.trim()}`).join(", ")}, d.client_name, d.deal_value, d.closer_id
            FROM deal_agent_preps p JOIN deals d ON d.id = p.deal_id
            ${filters.length ? `WHERE ${filters.map((f) => f.sql).join(" AND ")}` : ""}
            ORDER BY p.updated_at DESC`,
      args: filters.flatMap((f) => f.args),
    }),
    !opts.status || opts.status === "queued" ? awaitingFirstPrep(closerIds) : Promise.resolve([]),
  ]);
  const rows: ListedPrep[] = [
    ...tracked.rows.map((r) => ({
      ...presentDealPrep(rowToPrep(r as Record<string, unknown>)),
      clientName: String(r.client_name ?? ""),
      dealValueCents: Number(r.deal_value ?? 0),
      closerId: String(r.closer_id ?? ""),
    })),
    ...awaiting,
  ];
  const filtered = opts.status ? rows.filter((r) => r.status === opts.status) : rows;
  if (opts.status === "queued") filtered.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return { items: filtered.slice(opts.offset, opts.offset + opts.limit), total: filtered.length };
}

async function invoiceStatusOf(dealId: string): Promise<string | null> {
  return (await getDealInvoiceStatuses([dealId]))[dealId]?.status ?? null;
}

// ---------------------------------------------------------------------------
// A person's edits are never overwritten
// ---------------------------------------------------------------------------

/** The paperwork as the agent last left it (its submit, or a run refused for outdated inputs) — the baseline for spotting a person's edits. */
async function preparedSnapshotOf(dealId: string): Promise<PaperworkSnapshot | null> {
  const res = await getDb().execute({ sql: "SELECT prepared_snapshot FROM deal_agent_preps WHERE deal_id = ?", args: [dealId] });
  return parseJson<PaperworkSnapshot>(res.rows[0]?.prepared_snapshot);
}

/** A person asked for this run (Re-run) — it may rebuild their edits. */
function personAskedForRun(prep: DealPrepRecord): boolean {
  return prep.reason === "rerun" && (prep.status === "queued" || prep.status === "dispatched");
}

/**
 * Did a person change the paperwork since the agent last left it — or, never
 * prepared, since deal creation generated it? Prepared deals are compared by
 * content (DocuSeal builder edits and deletions count, the invoice email sync
 * doesn't); unknown counts as edited.
 */
async function paperworkEditedByPerson(dealId: string, paperwork?: DealPaperwork): Promise<boolean> {
  const pw = paperwork ?? (await loadDealPaperwork(dealId));
  const prepared = await preparedSnapshotOf(dealId);
  if (prepared) return paperworkChanged(prepared, await buildPaperworkSnapshot(pw, { withBaseDiff: false }));
  return !isGeneratedPaperwork([
    ...(pw.primary ? [{ kind: "primary" as const, createdAt: pw.primary.createdAt, updatedAt: pw.primary.updatedAt }] : []),
    ...pw.additional.map((a) => ({ kind: "additional" as const, createdAt: a.createdAt, updatedAt: a.updatedAt })),
    ...pw.contracts.map((c) => ({
      kind: c.kind,
      createdAt: c.record.createdAt,
      updatedAt: c.record.updatedAt,
      customized: c.record.docusealTemplateOverrideId != null,
    })),
  ]);
}

/** Terminal: the deal's invoice went out. */
async function markSent(dealId: string): Promise<void> {
  await getDb().execute({
    sql: `UPDATE deal_agent_preps SET status = 'sent', run_started_at = NULL, updated_at = datetime('now') WHERE deal_id = ?`,
    args: [dealId],
  });
}

/** Hands off: a person's edits are in the way until a person asks for a re-run. */
async function markStale(dealId: string, hash: string): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO deal_agent_preps (deal_id, status, input_hash, reason) VALUES (?, 'stale', ?, 'edited by a person')
          ON CONFLICT(deal_id) DO UPDATE SET status = 'stale', reason = excluded.reason, run_started_at = NULL,
            updated_at = datetime('now')
          WHERE deal_agent_preps.status != 'sent'`,
    args: [dealId, hash],
  });
}

/**
 * A run passed the start gate: mark it working — the "Agent working" badge,
 * stall detection (manual runs too), off the queued list so a second batch
 * doesn't pick it up, and later context reads in the same run skip the gate.
 */
async function startRun(dealId: string, hash: string): Promise<void> {
  // attempts: an auto-mode dispatch (dispatched, no run started) already counted this run.
  await getDb().execute({
    sql: `INSERT INTO deal_agent_preps (deal_id, status, input_hash, reason, attempts, dispatched_at, run_started_at)
          VALUES (?, 'dispatched', ?, 'manual', 1, datetime('now'), datetime('now'))
          ON CONFLICT(deal_id) DO UPDATE SET
            status = 'dispatched',
            attempts = deal_agent_preps.attempts
              + CASE WHEN deal_agent_preps.status = 'dispatched' AND deal_agent_preps.run_started_at IS NULL THEN 0 ELSE 1 END,
            dispatched_at = datetime('now'), run_started_at = datetime('now'), error = NULL, updated_at = datetime('now')
          WHERE deal_agent_preps.status != 'sent'`,
    args: [dealId, hash],
  });
}

export class DealPrepError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

/**
 * The gate at the start of every run (getDealPrepContext): the deal must have
 * draft paperwork to prepare, and a person's edits must not be in the way —
 * if they are, the prep turns `stale` and the run is refused (409) until a
 * person asks for a re-run. Passing marks the run working (startRun).
 */
export async function assertDealPreparable(deal: DealRecord, paperwork: DealPaperwork): Promise<void> {
  const skip = (why: string) => new DealPrepError(`${why} Skip this deal — don't edit its paperwork.`, 409, "conflict");
  if (deal.status !== "closed" || deal.dealValue <= 0) {
    throw skip(`This deal is ${deal.status === "closed" ? "closed with no value" : deal.status} — nothing to prepare.`);
  }
  if (!paperwork.primary) throw skip("This deal has no invoice yet — nothing to prepare.");
  if (paperwork.primary.status === "sent") throw skip("A person already sent this deal's invoice.");
  const prep = await findDealPrep(deal.id);
  // This run already passed: its own edits since then aren't a person's.
  if (prep?.runStartedAt && effectiveDealPrepStatus(prep, Date.now()).status === "dispatched") return;
  if (!(prep && personAskedForRun(prep))) {
    if (prep?.status === "stale" || (await paperworkEditedByPerson(deal.id, paperwork))) {
      if (prep?.status !== "stale") await markStale(deal.id, dealPrepInputHash(deal));
      throw skip(
        "A person edited this deal's paperwork, so it's left to them (an admin can re-run the agent from the deal's invoice drawer to let it rebuild it)."
      );
    }
  }
  await startRun(deal.id, dealPrepInputHash(deal));
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function firePayload(dealId: string, reason: string): string {
  return [
    "A closed deal is ready for paperwork prep in the Agency Collective dashboard.",
    `dealId: ${dealId}`,
    `reason: ${reason}`,
    `Call the Agency Collective tool getDealPrepContext with this dealId and follow the instructions it returns. Finish with submitDealPrep. ${DEAL_PREP_SKIP_RULE}`,
  ].join("\n");
}

/**
 * Fire the routine for a deal. Claims the row first (so concurrent requests
 * can't double-fire — the endpoint has no idempotency key) and records the
 * session URL, or the failure so the badge offers a re-run.
 */
export async function dispatchDealPrep(dealId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = routineConfig();
  if (!cfg) return { ok: true }; // queue-only mode: a scheduled/manual run picks it up
  await ensureMigrated();
  const db = getDb();
  const claim = await db.execute({
    sql: `UPDATE deal_agent_preps
          SET status = 'dispatched', dispatched_at = datetime('now'), run_started_at = NULL, attempts = attempts + 1,
              session_url = NULL, error = NULL, reason = ?, updated_at = datetime('now')
          WHERE deal_id = ? AND status = 'queued'`,
    args: [reason, dealId],
  });
  if ((claim.rowsAffected ?? 0) === 0) return { ok: true }; // someone else dispatched it

  let error: string | null = null;
  let sessionUrl: string | null = null;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "anthropic-version": "2026-10-21",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: firePayload(dealId, reason) }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | { claude_code_session_url?: string; error?: { message?: string } }
      | null;
    if (res.ok) {
      // Rendered as a link in the drawer — https only.
      const url = body?.claude_code_session_url;
      sessionUrl = typeof url === "string" && /^https:\/\//i.test(url) ? url : null;
    } else {
      const retry = res.headers.get("retry-after");
      error = `Agent trigger failed (HTTP ${res.status})${body?.error?.message ? `: ${body.error.message}` : ""}${retry ? ` — retry after ${retry}s` : ""}`;
    }
  } catch (err) {
    error = `Agent trigger failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (error) {
    // Token/URL are never logged — only the status line.
    console.error("[dealPrep] dispatch failed:", error);
    await db.execute({
      sql: `UPDATE deal_agent_preps SET status = 'failed', error = ?, updated_at = datetime('now')
            WHERE deal_id = ? AND status = 'dispatched'`,
      args: [error, dealId],
    });
    return { ok: false, error };
  }
  await db.execute({
    sql: `UPDATE deal_agent_preps SET session_url = ?, updated_at = datetime('now') WHERE deal_id = ?`,
    args: [sessionUrl, dealId],
  });
  return { ok: true };
}

/**
 * (Re-)queue a deal for the agent and, in auto mode, fire a run. Never
 * revives a sent prep, and only a person's re-run lifts `stale`. `leftByAgent`
 * replaces the baseline (prepared_snapshot) when a run ends without being
 * recorded — so the next run doesn't take its edits for a person's.
 */
async function queueDealPrep(
  dealId: string,
  hash: string,
  reason: string,
  leftByAgent?: PaperworkSnapshot | null
): Promise<{ ok: boolean; error?: string }> {
  await ensureMigrated();
  const baseline = leftByAgent !== undefined;
  await getDb().execute({
    sql: `INSERT INTO deal_agent_preps (deal_id, status, input_hash, reason, prepared_snapshot) VALUES (?, 'queued', ?, ?, ?)
          ON CONFLICT(deal_id) DO UPDATE SET status = 'queued', input_hash = excluded.input_hash, reason = excluded.reason,
            ${baseline ? "prepared_snapshot = excluded.prepared_snapshot," : ""}
            run_started_at = NULL, error = NULL, updated_at = datetime('now')
          WHERE deal_agent_preps.status != 'sent' AND (deal_agent_preps.status != 'stale' OR excluded.reason = 'rerun')`,
    args: [dealId, hash, reason, leftByAgent ? JSON.stringify(leftByAgent) : null],
  });
  return dispatchDealPrep(dealId, reason);
}

/** What the agent left — unreadable contracts are marked inside; null only if the snapshot itself failed. */
async function snapshotLeftByAgent(paperwork: DealPaperwork): Promise<PaperworkSnapshot | null> {
  try {
    return await buildPaperworkSnapshot(paperwork, { withBaseDiff: false });
  } catch (err) {
    console.error("[dealPrep] prepared snapshot failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// The one hook every deal write path calls
// ---------------------------------------------------------------------------

/**
 * Reconcile a deal's prep with its current state: queue a closed deal with a
 * draft invoice (auto mode only), re-queue when its inputs changed (or mark
 * stale when a person edited the paperwork), mark sent once the invoice went
 * out. Idempotent — safe to call after ANY deal write. Once the agent
 * prepared a deal it is tracked in every mode, so a closer's later edit never
 * leaves an outdated "Agent ready" badge.
 */
export async function syncDealPrep(dealId: string, reason: string): Promise<void> {
  const [deal, prep] = await Promise.all([findDeal(dealId), findDealPrep(dealId)]);
  if (!prep && !autoQueues()) return;
  if (!deal || deal.status !== "closed" || deal.dealValue <= 0) return;
  const invoiceStatus = await invoiceStatusOf(dealId);
  if (!invoiceStatus) return; // no paperwork to prepare (yet)

  await ensureMigrated();
  if (invoiceStatus === "sent") {
    if (prep && prep.status !== "sent") await markSent(dealId);
    return;
  }

  const hash = dealPrepInputHash(deal);
  if (!prep) {
    // OR IGNORE: two concurrent writes on a fresh deal both land here.
    const ins = await getDb().execute({
      sql: `INSERT OR IGNORE INTO deal_agent_preps (deal_id, status, input_hash, reason) VALUES (?, 'queued', ?, ?)`,
      args: [dealId, hash, reason],
    });
    if ((ins.rowsAffected ?? 0) > 0) await dispatchDealPrep(dealId, reason);
    return;
  }
  if (prep.status === "sent" || prep.status === "stale" || prep.inputHash === hash) return;
  // A live run finishes on the details it read: its submit is refused
  // (inputHash) and queues the fresh run then — never two runs at once.
  if (effectiveDealPrepStatus(prep, Date.now()).status === "dispatched") return;

  const asked = personAskedForRun(prep);
  if (!asked && (await paperworkEditedByPerson(dealId))) {
    await markStale(dealId, hash);
    return;
  }
  await queueDealPrep(dealId, hash, asked ? "rerun" : "deal changed");
}

/**
 * Run syncDealPrep after the response (Vercel keeps the function alive via
 * waitUntil). Never throws into the caller's write path.
 */
export function scheduleDealPrepSync(dealId: string, reason: string): void {
  waitUntil(
    syncDealPrep(dealId, reason).catch((err) =>
      console.error("[dealPrep] sync failed:", err instanceof Error ? err.message : err)
    )
  );
}

/**
 * Admin "Re-run agent" — also for stale, failed and finished preps: a person
 * asking lifts `stale`. Auto mode fires the routine; manual mode queues the
 * deal for the next run in Claude.
 */
export async function rerunDealPrep(dealId: string): Promise<DealPrepRecord> {
  const deal = await findDeal(dealId);
  if (!deal) throw new DealPrepError("Deal not found", 404, "not_found");
  if (deal.status !== "closed" || deal.dealValue <= 0) {
    throw new DealPrepError("Only closed deals with a value are prepared", 400, "invalid_request");
  }
  const invoiceStatus = await invoiceStatusOf(dealId);
  if (!invoiceStatus) throw new DealPrepError("This deal has no invoice yet", 400, "invalid_request");
  if (invoiceStatus === "sent") throw new DealPrepError("This deal's invoice was already sent", 409, "conflict");
  const current = await findDealPrep(dealId);
  if (current && effectiveDealPrepStatus(current, Date.now()).status === "dispatched") {
    throw new DealPrepError("The agent is already working on this deal", 409, "conflict");
  }

  const fired = await queueDealPrep(dealId, dealPrepInputHash(deal), "rerun");
  const prep = await findDealPrep(dealId);
  if (!prep) throw new DealPrepError("Prep not found", 500, "internal_error");
  if (!fired.ok) throw new DealPrepError(fired.error ?? "Agent trigger failed", 502, "internal_error");
  return prep;
}

// ---------------------------------------------------------------------------
// The agent reports back
// ---------------------------------------------------------------------------

export async function submitDealPrep(
  dealId: string,
  input: { status: "ready" | "needs_input"; summary: string; flags: DealPrepFlag[]; inputHash: string },
  preparedBy: string
): Promise<DealPrepRecord> {
  const deal = await findDeal(dealId);
  if (!deal) throw new DealPrepError("Deal not found", 404, "not_found");
  if (deal.status !== "closed") throw new DealPrepError(`Deal is ${deal.status}, not closed — nothing to submit`, 409, "conflict");
  const paperwork = await loadDealPaperwork(dealId);
  if (paperwork.primary?.status === "sent") {
    throw new DealPrepError("The invoice was already sent by a person — your prep was not recorded", 409, "conflict");
  }

  const hash = dealPrepInputHash(deal);
  const snapshot = await snapshotLeftByAgent(paperwork);
  if (input.inputHash !== hash) {
    // The deal changed while this run worked. Now that it is ending, queue
    // the fresh run (never two at once), with what this run left as the
    // baseline — its edits aren't a person's.
    await queueDealPrep(dealId, hash, "deal changed", snapshot);
    throw new DealPrepError(
      "The deal changed while you were working (inputHash mismatch). Stop — a fresh run uses the new details.",
      409,
      "conflict"
    );
  }

  await ensureMigrated();
  await getDb().execute({
    sql: `INSERT INTO deal_agent_preps (deal_id, status, input_hash, reason, summary, flags, prepared_snapshot, finished_at, error)
          VALUES (?, ?, ?, 'manual', ?, ?, ?, datetime('now'), NULL)
          ON CONFLICT(deal_id) DO UPDATE SET status = excluded.status, input_hash = excluded.input_hash,
            summary = excluded.summary, flags = excluded.flags, prepared_snapshot = excluded.prepared_snapshot,
            finished_at = excluded.finished_at, run_started_at = NULL, error = NULL, updated_at = datetime('now')`,
    args: [dealId, input.status, hash, input.summary, JSON.stringify(input.flags), snapshot ? JSON.stringify(snapshot) : null],
  });

  // Same privacy rule as draft pushes: amount + preparer, never the client.
  sendPushToAllAdmins({
    title: input.status === "ready" ? "Agent prepared a deal — ready to review" : "Agent prepared a deal — needs your input",
    body: `${preparedBy} prepared a ${formatCentsExact(deal.dealValue)} deal's invoice and contract`,
    url: "/dashboard/closers/deals",
    tag: `deal-prep-${dealId}`,
  }).catch((err) => console.error("[dealPrep] push failed:", err));

  const prep = await findDealPrep(dealId);
  if (!prep) throw new DealPrepError("Prep not found", 500, "internal_error");
  return prep;
}

// ---------------------------------------------------------------------------
// After a person sends: terminal status + learn from it
// ---------------------------------------------------------------------------

/**
 * Called after a successful deal invoice send. Marks the prep sent and
 * records an exemplar of what actually went out — with the reviewer's
 * corrections when the agent's prep still matched the deal (ready /
 * needs_input). After a re-queue or a person taking over, the differences
 * aren't the agent's mistakes, so they teach nothing.
 */
export async function recordDealSent(dealId: string): Promise<void> {
  await ensureMigrated();
  const deal = await findDeal(dealId);
  if (!deal) return;
  const [prep, prepared] = await Promise.all([findDealPrep(dealId), preparedSnapshotOf(dealId)]);
  await markSent(dealId);
  const sent = await buildPaperworkSnapshot(await loadDealPaperwork(dealId), { withBaseDiff: true, sentOnly: true });
  const agentWorkCurrent = prep?.status === "ready" || prep?.status === "needs_input";
  const corrections = agentWorkCurrent && prepared ? diffPaperwork(prepared, sent) : null;
  await upsertExemplar(deal, sent, { corrections, source: "send" });
}

/** Background wrapper for the send route. */
export function scheduleRecordDealSent(dealId: string): void {
  waitUntil(
    recordDealSent(dealId).catch((err) =>
      console.error("[dealPrep] recording the sent deal failed:", err instanceof Error ? err.message : err)
    )
  );
}
