// Peptide AI in the client portal — per-client access to the Peptide AI app (a
// separate app at PEPTIDE_AI_URL, the PeptidesAgent repo) with a monthly budget
// that resets on the client's billing day. No rollover: each cycle starts empty.
//
// This dashboard owns the POLICY (on/off, budget, reset day); Peptide AI
// ENFORCES it — it already reserves an estimate against the cap before every
// model call, so a second ledger here could only drift from the real one. The
// apps talk through short-lived HS256 JWTs under one shared secret
// (PEPTIDE_AI_SHARED_SECRET, identical in both):
//   - launch: "Open Peptide AI" → Peptide AI /sso/start pins a random state to
//     the browser and sends it back to our launch route, which mints a
//     single-use token carrying that state and the policy → Peptide AI /sso
//     signs the client into their own managed account (created on first
//     launch, never matched by email to a self-serve one) — only in the
//     browser holding that state;
//   - sync: POST {PEPTIDE_AI_URL}/api/partner/accounts with a token bound to
//     the body. Entries with `enabled` PUSH policy; entries without only READ
//     usage. Policy is pushed on edits (schedulePeptideAiSync), on launch, and
//     when a read finds Peptide AI out of step (a push that was missed) — page
//     loads otherwise write nothing. Every token carries `ts`; Peptide AI
//     ignores policy older than what it already has.

import crypto from "crypto";
import { SignJWT } from "jose";
import { waitUntil } from "@vercel/functions";
import { getDb } from "./db";
import { findUsersByIds, type UserRecord } from "./users";
import { getAllClientBilling, getClientBilling, type ClientBilling } from "./clientBilling";
import {
  PEPTIDE_AI_DEFAULT_CAP_CENTS,
  type PeptideAiOffReason,
  type PeptideAiUsage,
} from "./peptideAiPresentation";

const ISSUER = "agencycollective-dashboard";
// Peptide AI's accepted client-id shape; ours are "<slug>-<8 hex>".
const CLIENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
// The state Peptide AI's /sso/start pins to the browser (24 random bytes, base64url).
const LAUNCH_STATE = /^[A-Za-z0-9_-]{16,128}$/;

// ---------------------------------------------------------------------------
// Per-client settings (client_peptide_ai; no row = defaults)
// ---------------------------------------------------------------------------

export interface PeptideAiSetting {
  enabled: boolean;
  /** Monthly budget override in cents; null = PEPTIDE_AI_DEFAULT_CAP_CENTS. */
  capCents: number | null;
}

interface SettingRow extends PeptideAiSetting {
  /** Reset day pinned the first time a client with no billing dates needed one. */
  anchorDay: number | null;
}

const DEFAULT_SETTING: SettingRow = { enabled: true, capCents: null, anchorDay: null };

function rowToSetting(r: Record<string, unknown>): SettingRow {
  return {
    enabled: Number(r.enabled) === 1,
    capCents: r.cap_cents == null ? null : Number(r.cap_cents),
    anchorDay: r.anchor_day == null ? null : Number(r.anchor_day),
  };
}

/** Live clients' settings (deleted clients' markers excluded). */
export async function getPeptideAiSettings(): Promise<Map<string, SettingRow>> {
  const result = await getDb().execute(
    "SELECT user_id, enabled, cap_cents, anchor_day FROM client_peptide_ai WHERE deleted_at IS NULL"
  );
  return new Map(result.rows.map((r) => [String(r.user_id), rowToSetting(r)]));
}

export async function getPeptideAiSetting(userId: string): Promise<SettingRow> {
  const result = await getDb().execute({
    sql: "SELECT enabled, cap_cents, anchor_day FROM client_peptide_ai WHERE user_id = ? AND deleted_at IS NULL",
    args: [userId],
  });
  return result.rows[0] ? rowToSetting(result.rows[0]) : DEFAULT_SETTING;
}

export async function setPeptideAiSetting(userId: string, s: PeptideAiSetting): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO client_peptide_ai (user_id, enabled, cap_cents, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            enabled = excluded.enabled, cap_cents = excluded.cap_cents, updated_at = excluded.updated_at`,
    args: [userId, s.enabled ? 1 : 0, s.capCents],
  });
}

/**
 * Pin a reset day for clients that have no billing dates to take one from: the
 * day it was first needed, kept from then on (the first writer wins, so
 * concurrent requests agree). Returns each client's pinned day.
 */
async function pinAnchorDays(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const db = getDb();
  const today = new Date().getUTCDate();
  await db.batch(
    userIds.map((id) => ({
      sql: `INSERT INTO client_peptide_ai (user_id, anchor_day) VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET anchor_day = COALESCE(client_peptide_ai.anchor_day, excluded.anchor_day)`,
      args: [id, today],
    })),
    "write"
  );
  const result = await db.execute({
    sql: `SELECT user_id, anchor_day FROM client_peptide_ai WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
    args: userIds,
  });
  return new Map(result.rows.map((r) => [String(r.user_id), Number(r.anchor_day)]));
}

// ---------------------------------------------------------------------------
// Policy (pure)
// ---------------------------------------------------------------------------

export interface PeptideAiPolicy {
  clientId: string;
  enabled: boolean;
  offReason: PeptideAiOffReason | null;
  name: string;
  capCents: number;
  /** Day of month (1-31) the budget resets on. */
  anchorDay: number;
}

const validDay = (d: number | null | undefined): number | null =>
  d != null && Number.isInteger(d) && d >= 1 && d <= 31 ? d : null;

const dayOf = (date: string | null | undefined): number | null => {
  const m = date?.match(/^\d{4}-\d{2}-(\d{2})/);
  return m ? validDay(Number(m[1])) : null;
};

/**
 * The day the budget resets on — the re-bill schedule's billing day: the
 * explicit billing day, else the "last billed" override's day, else the day
 * the client joined. Null when none is known (the caller pins one); never the
 * creation date, which `users` doesn't store (it reads back as "now").
 */
export function peptideAiAnchorDay(
  user: Pick<UserRecord, "joinedAt">,
  billing: Pick<ClientBilling, "billingDay" | "lastRebilledOverride"> | null
): number | null {
  return validDay(billing?.billingDay) ?? dayOf(billing?.lastRebilledOverride) ?? dayOf(user.joinedAt);
}

/**
 * A client's effective Peptide AI policy. Access needs the admin switch on, a
 * live client (active or onboarding — inactive/archived count as churned) and
 * billing not paused.
 */
export function peptideAiPolicy(
  user: Pick<UserRecord, "id" | "slug" | "displayName" | "status">,
  billing: Pick<ClientBilling, "paused"> | null,
  setting: PeptideAiSetting,
  anchorDay: number
): PeptideAiPolicy {
  const offReason: PeptideAiOffReason | null = !setting.enabled
    ? "disabled"
    : user.status === "inactive" || user.status === "archived"
      ? "churned"
      : billing?.paused
        ? "paused"
        : null;
  return {
    clientId: user.id,
    enabled: offReason === null,
    offReason,
    name: (user.displayName.trim() || user.slug).slice(0, 200),
    capCents: setting.capCents ?? PEPTIDE_AI_DEFAULT_CAP_CENTS,
    anchorDay,
  };
}

/** Whether an edit to these client fields changes their Peptide AI policy. */
export function peptideAiInputsChanged(
  before: Pick<UserRecord, "status" | "displayName" | "joinedAt">,
  changes: Partial<Pick<UserRecord, "status" | "displayName" | "joinedAt">>
): boolean {
  return (
    (changes.status !== undefined && changes.status !== before.status) ||
    (changes.displayName !== undefined && changes.displayName !== before.displayName) ||
    (changes.joinedAt !== undefined && changes.joinedAt !== before.joinedAt)
  );
}

export async function getPeptideAiPolicy(user: UserRecord): Promise<PeptideAiPolicy> {
  return (await getPeptideAiPolicies([user])).get(user.id)!;
}

/** Policies for many clients in a few queries. */
export async function getPeptideAiPolicies(users: UserRecord[]): Promise<Map<string, PeptideAiPolicy>> {
  const [billing, settings] = await Promise.all([
    users.length === 1
      ? getClientBilling(users[0].id).then((b) => new Map(b ? [[users[0].id, b]] : []))
      : getAllClientBilling(),
    users.length === 1
      ? getPeptideAiSetting(users[0].id).then((s) => new Map([[users[0].id, s]]))
      : getPeptideAiSettings(),
  ]);
  const anchors = new Map<string, number | null>(
    users.map((u) => [
      u.id,
      peptideAiAnchorDay(u, billing.get(u.id) ?? null) ?? settings.get(u.id)?.anchorDay ?? null,
    ])
  );
  const pinned = await pinAnchorDays([...anchors].filter(([, d]) => d === null).map(([id]) => id));
  return new Map(
    users.map((u) => [
      u.id,
      peptideAiPolicy(
        u,
        billing.get(u.id) ?? null,
        settings.get(u.id) ?? DEFAULT_SETTING,
        anchors.get(u.id) ?? pinned.get(u.id)!
      ),
    ])
  );
}

/**
 * Whether Peptide AI's view of a client disagrees with the policy here — a
 * push that was missed (Peptide AI down at the time). Never-launched clients
 * can't disagree: their policy arrives with the first launch.
 */
export function peptideAiOutOfSync(policy: PeptideAiPolicy, usage: PeptideAiUsage | undefined): boolean {
  if (!usage?.provisioned) return false;
  if (!policy.enabled) return usage.status === "active";
  if (usage.suspendedBy === "agency") return true;
  return usage.capCents !== policy.capCents || usage.anchorDay !== policy.anchorDay || usage.name !== policy.name;
}

// ---------------------------------------------------------------------------
// Talking to Peptide AI
// ---------------------------------------------------------------------------

function peptideAiConfig(): { url: string; key: Uint8Array } | null {
  const raw = process.env.PEPTIDE_AI_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.PEPTIDE_AI_SHARED_SECRET;
  if (!raw || !secret || secret.length < 32) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Tokens travel on this URL: plain http only for a Peptide AI on this machine.
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  return { url: raw, key: new TextEncoder().encode(secret) };
}

export function isPeptideAiConfigured(): boolean {
  return peptideAiConfig() !== null;
}

function signToken(audience: string, claims: Record<string, unknown>) {
  return new SignJWT({ ...claims, ts: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("60s");
}

/** Where a launch begins: Peptide AI pins a state to the browser, then sends it back to our launch route. */
export function peptideAiStartUrl(): string {
  const config = peptideAiConfig();
  if (!config) throw new Error("Peptide AI is not configured (PEPTIDE_AI_URL / PEPTIDE_AI_SHARED_SECRET)");
  return `${config.url}/sso/start`;
}

export const isLaunchState = (state: string | null): state is string => !!state && LAUNCH_STATE.test(state);

/**
 * The URL that signs this client into Peptide AI: valid once, for a minute,
 * and only in the browser holding `state` (from /sso/start). The token carries
 * the policy, so a launch also brings the account up to date.
 */
export async function peptideAiLaunchUrl(policy: PeptideAiPolicy, state: string): Promise<string> {
  const config = peptideAiConfig();
  if (!config) throw new Error("Peptide AI is not configured (PEPTIDE_AI_URL / PEPTIDE_AI_SHARED_SECRET)");
  if (!policy.enabled) throw new Error("Peptide AI is off for this client");
  if (!isLaunchState(state)) throw new Error("Invalid launch state");
  const token = await signToken("peptide-ai/sso", {
    name: policy.name,
    capCents: policy.capCents,
    anchorDay: policy.anchorDay,
    nonce: state,
  })
    .setSubject(policy.clientId)
    .setJti(crypto.randomUUID())
    .sign(config.key);
  return `${config.url}/sso?t=${encodeURIComponent(token)}`;
}

type SyncEntry = { clientId: string; enabled?: boolean; name?: string; capCents?: number; anchorDay?: number };

const SYNC_BATCH = 500;

/**
 * POST entries to Peptide AI's partner API and collect each client's usage.
 * Throws when Peptide AI is unreachable, slow or not configured — callers
 * decide how to degrade.
 */
async function callPartner(entries: SyncEntry[], timeoutMs: number): Promise<Map<string, PeptideAiUsage>> {
  const config = peptideAiConfig();
  if (!config) throw new Error("Peptide AI is not configured (PEPTIDE_AI_URL / PEPTIDE_AI_SHARED_SECRET)");
  // An id Peptide AI would reject is skipped here rather than sent.
  const valid = entries.filter((e) => CLIENT_ID.test(e.clientId));
  const usage = new Map<string, PeptideAiUsage>();
  for (let i = 0; i < valid.length; i += SYNC_BATCH) {
    const body = JSON.stringify({ accounts: valid.slice(i, i + SYNC_BATCH) });
    // Bound to this exact body, so a captured token can't carry another request.
    const bh = crypto.createHash("sha256").update(body).digest("base64url");
    const res = await fetch(`${config.url}/api/partner/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await signToken("peptide-ai/partner", { bh }).sign(config.key)}`,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Peptide AI sync failed: HTTP ${res.status}`);
    const json = (await res.json()) as { accounts: PeptideAiUsage[]; rejected?: string[] };
    if (json.rejected?.length) console.warn("[peptideAi] entries rejected by Peptide AI:", json.rejected);
    for (const a of json.accounts) usage.set(a.clientId, a);
  }
  return usage;
}

const policyEntry = (p: PeptideAiPolicy): SyncEntry => ({
  clientId: p.clientId,
  enabled: p.enabled,
  name: p.name,
  capCents: p.capCents,
  anchorDay: p.anchorDay,
});

/** Read these clients' usage in Peptide AI; changes nothing there. */
export function readPeptideAiUsage(clientIds: string[], timeoutMs = 8_000) {
  return callPartner(
    clientIds.map((clientId) => ({ clientId })),
    timeoutMs
  );
}

/** Push these policies to Peptide AI and return the usage it reports back. */
export function pushPeptideAiPolicies(policies: PeptideAiPolicy[], timeoutMs = 10_000) {
  return callPartner(policies.map(policyEntry), timeoutMs);
}

/**
 * Read usage, and push the policy of any client Peptide AI is out of step
 * with — re-read just before pushing, so this page's older read can't undo a
 * change saved meanwhile. The catch-up for pushes that failed.
 */
export async function readAndReconcilePeptideAi(
  policies: PeptideAiPolicy[],
  timeoutMs = 8_000
): Promise<Map<string, PeptideAiUsage>> {
  const usage = await readPeptideAiUsage(
    policies.map((p) => p.clientId),
    timeoutMs
  );
  const stale = policies.filter((p) => peptideAiOutOfSync(p, usage.get(p.clientId)));
  if (stale.length > 0) {
    const fresh = await getPeptideAiPolicies(await findUsersByIds(stale.map((p) => p.clientId)));
    const pushed = await pushPeptideAiPolicies([...fresh.values()], timeoutMs);
    pushed.forEach((u, id) => usage.set(id, u));
  }
  return usage;
}

/**
 * Switch off clients this dashboard deleted (their `client_peptide_ai` row is
 * kept as a marker until Peptide AI confirms), then drop the markers.
 */
export async function disableDeletedPeptideAiClients(timeoutMs = 10_000): Promise<void> {
  const db = getDb();
  const result = await db.execute("SELECT user_id FROM client_peptide_ai WHERE deleted_at IS NOT NULL");
  const ids = result.rows.map((r) => String(r.user_id));
  if (ids.length === 0) return;
  await callPartner(
    ids.map((clientId) => ({ clientId, enabled: false })),
    timeoutMs
  );
  await db.execute({
    sql: `DELETE FROM client_peptide_ai WHERE deleted_at IS NOT NULL AND user_id IN (${ids.map(() => "?").join(",")})`,
    args: ids,
  });
}

/**
 * Push a client's policy after a change that affects it (status, name, join
 * date, billing pause or day, the admin switch, deletion), after the response
 * — Vercel keeps the function alive via waitUntil. A deleted client is
 * switched off and its marker dropped. One retry; a push that still fails is
 * caught up by the next portal visit, admin view or launch. Never throws into
 * the caller's write path.
 */
export function schedulePeptideAiSync(userId: string): void {
  if (!isPeptideAiConfigured()) return;
  const attempt = async () => {
    const [user] = await findUsersByIds([userId]);
    if (user) {
      await pushPeptideAiPolicies([await getPeptideAiPolicy(user)]);
      return;
    }
    await callPartner([{ clientId: userId, enabled: false }], 10_000);
    await getDb().execute({
      sql: "DELETE FROM client_peptide_ai WHERE user_id = ? AND deleted_at IS NOT NULL",
      args: [userId],
    });
  };
  waitUntil(
    attempt()
      .catch(() => new Promise((r) => setTimeout(r, 2_000)).then(attempt))
      .catch((err) => console.error("[peptideAi] sync failed:", err instanceof Error ? err.message : err))
  );
}
