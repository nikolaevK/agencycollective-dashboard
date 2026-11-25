// Deal proposal → GHL contact sync (both sub-accounts).
//
// Whenever a deal's contracts change (sent, resent, viewed, signed, declined,
// expired, replaced, deleted), the lead's GHL contact is brought in line with
// the CURRENT proposal state (pure rules in lib/ghlDealRules.ts):
//   1. Contact fields "Proposal Link", "Proposal Link 2", 3, … (one per open
//      contract, however many — a missing "Proposal Link N" is created),
//      "Proposal Status", "Proposal Value", "Proposal Sent Date". Written
//      FIRST, so a workflow fired by the tag below already merges the right
//      links into its first email / SMS.
//   2. Signed → the funnel opportunity is marked Won with the deal value
//      (paid → "Active Client" + Won, lib/ghlCrmSync.ts).
//   3. proposal_* tags — one per status; GHL workflows trigger on "tag added":
//      proposal_sent starts the follow-ups, proposal_viewed texts the closer,
//      proposal_signed ends the follow-ups.
//
// One GHL contact, possibly several deals (a deal recreated with a revised
// contract, a later upsell): the contact mirrors the deal with the latest
// proposal ACTIVITY — a send or a signature — among the deals sharing the
// client email that resolve to the SAME contact (`drivingDealId`). An older
// deal's late view / expiry can't overwrite the newer proposal, while the lead
// signing an older deal's still-live link does take over (it's newer).
//
// Level-based + idempotent: it re-derives the state from the DB every run, so
// re-running (DocuSeal webhook retries, the drawer's Sync button) is safe and
// heals a missed event. Lead resolution goes through resolveDealGhlContact, so
// a deal recreated without a calendar event still reaches its lead. Runs in
// the background (waitUntil), never throws into the caller's write path, and
// is a no-op when GHL isn't configured or the lead isn't in GHL.

import { waitUntil } from "@vercel/functions";
import { describeError } from "./ghl/client";
import { isAnyGhlConfigured, type GhlSubAccountId } from "./ghl/subAccounts";
import { listContactFields, createContactTextField, updateContactCustomFields } from "./ghl/customFields";
import {
  resolveDealGhlContact,
  applyTags,
  syncTargetActiveClient,
  syncTargetWon,
  type GhlLeadTarget,
} from "./ghlCrmSync";
import {
  deriveProposal,
  proposalTagPlan,
  proposalFieldValues,
  proposalLinkFieldName,
  proposalLinkIndex,
  PROPOSAL_FIELDS,
  type DerivedProposal,
  type ProposalFieldValues,
} from "./ghlDealRules";
import { businessTodayYmd } from "./businessTime";
import { getDb, ensureMigrated } from "./db";
import { findDeal, type DealRecord } from "./deals";
import { findDealContractByDealId } from "./dealContracts";
import { findAdditionalContractsByDealId } from "./dealAdditionalContracts";

export interface DealGhlSyncOptions {
  /** A sent contract was just replaced / deleted: when nothing is open any
   *  more, still drop the open tags + clear the links (otherwise a deal whose
   *  proposal state is "none" is left alone — nothing was ever sent). */
  clearIfNone?: boolean;
}

interface DealState {
  deal: DealRecord;
  proposal: DerivedProposal;
}

async function loadState(dealId: string): Promise<DealState | null> {
  const [deal, primary, additional] = await Promise.all([
    findDeal(dealId),
    findDealContractByDealId(dealId),
    findAdditionalContractsByDealId(dealId),
  ]);
  if (!deal) return null;
  const contracts = [...(primary ? [primary] : []), ...additional].map((c) => ({
    status: c.status,
    signingUrl: c.signingUrl,
    sentAt: c.sentAt,
  }));
  return { deal, proposal: deriveProposal(contracts) };
}

const stateKey = (s: DealState) =>
  JSON.stringify([s.proposal.state, s.proposal.links, s.proposal.sentAt, s.deal.paidStatus, s.deal.dealValue]);

/**
 * Among the deals sharing `clientEmail` (case-insensitive), the one with the
 * latest proposal activity: a contract send or signature, primary or
 * additional (both stamps are ISO strings, so MAX is chronological). Null when
 * none was ever sent. The caller still checks it's the SAME GHL contact.
 */
async function drivingDealId(clientEmail: string, excludeDealId?: string): Promise<string | null> {
  await ensureMigrated();
  // Correlated per-deal MAX()es: evaluated only for the few deals matching the
  // email, each an index SEARCH on deal_id (a JOIN against a UNION of the two
  // contract tables scanned both tables in full + built a temp index per run).
  const rows = await getDb().execute({
    sql: `SELECT id, last_activity FROM (
            SELECT d.id AS id,
                   MAX((SELECT MAX(COALESCE(MAX(c.sent_at), ''), COALESCE(MAX(c.signed_at), ''))
                          FROM deal_contracts c WHERE c.deal_id = d.id),
                       (SELECT MAX(COALESCE(MAX(a.sent_at), ''), COALESCE(MAX(a.signed_at), ''))
                          FROM deal_additional_contracts a WHERE a.deal_id = d.id)) AS last_activity
              FROM deals d
             WHERE d.client_email = ? COLLATE NOCASE AND d.id != ?
          )
          WHERE last_activity IS NOT NULL AND last_activity != ''
          ORDER BY last_activity DESC
          LIMIT 1`,
    args: [clientEmail, excludeDealId ?? ""],
  });
  return rows.rows[0]?.id != null ? String(rows.rows[0].id) : null;
}

const resolveTarget = (deal: DealRecord) =>
  resolveDealGhlContact({ dealId: deal.id, googleEventId: deal.googleEventId, clientEmail: deal.clientEmail, leadName: deal.clientName });

const sameTarget = (a: GhlLeadTarget, b: GhlLeadTarget) =>
  a.contactId === b.contactId && a.subAccountId === b.subAccountId;

// Field names already reported missing per sub-account (log once per process).
const warnedMissing = new Set<string>();

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// "Proposal Link N" creations in flight (concurrent syncs share one), and the
// ones GHL refused recently (e.g. the token lacks customFields.write) — not
// retried on every sync.
const creatingLinkField = new Map<string, Promise<string | null>>();
const linkFieldRefusedAt = new Map<string, number>();
const LINK_FIELD_RETRY_MS = 10 * 60_000;

/** The id of "Proposal Link N", creating it when the lead has more open
 *  contracts than the sub-account has link fields. Null when GHL refuses —
 *  that link is skipped (logged), the others still land. */
function ensureLinkField(n: number, sub: GhlSubAccountId): Promise<string | null> {
  const name = proposalLinkFieldName(n);
  const key = `${sub}:${name}`;
  const refusedAt = linkFieldRefusedAt.get(key);
  if (refusedAt !== undefined && Date.now() - refusedAt < LINK_FIELD_RETRY_MS) return Promise.resolve(null);
  const inflight = creatingLinkField.get(key);
  if (inflight) return inflight;
  const run = (async () => {
    // Re-read first: another instance may have just created it.
    const existing = (await listContactFields(sub, { fresh: true })).find((f) => proposalLinkIndex(f.name) === n);
    if (existing) return existing.id;
    const created = await createContactTextField(name, sub);
    console.log(`[ghl-deal-sync] created contact field "${name}" (sub=${sub})`);
    return created.id;
  })()
    .catch((err) => {
      linkFieldRefusedAt.set(key, Date.now());
      console.warn(
        `[ghl-deal-sync] could not create contact field "${name}" (sub=${sub}): ${describeError(err)} — ` +
          `add it in GHL as a single-line text field, or give the token locations/customFields.write`
      );
      return null;
    })
    .finally(() => creatingLinkField.delete(key));
  creatingLinkField.set(key, run);
  return run;
}

interface FieldWrite {
  name: string;
  id: string;
  value: string | number;
}

/** Did GHL store what we sent? Numbers compare numerically; a date only has
 *  to come back non-empty (GHL may echo it as a timestamp). */
function verified(w: FieldWrite, observed: string): boolean {
  if (typeof w.value === "number") return observed !== "" && Number(observed) === w.value;
  if (w.name === PROPOSAL_FIELDS.sentDate) return w.value === "" ? observed === "" : observed !== "";
  return observed === w.value;
}

async function writeProposalFields(target: GhlLeadTarget, values: ProposalFieldValues): Promise<void> {
  const sub: GhlSubAccountId = target.subAccountId;
  const keys = (Object.keys(values.fields) as Array<keyof ProposalFieldValues["fields"]>).filter(
    (k) => values.fields[k] !== undefined
  );
  if (keys.length === 0 && values.links === null) return;
  const fields = await listContactFields(sub);
  const idByName = new Map(fields.map((f) => [normName(f.name), f.id]));
  const writes: FieldWrite[] = [];
  for (const key of keys) {
    const name = PROPOSAL_FIELDS[key];
    const id = idByName.get(normName(name));
    if (id) {
      writes.push({ name, id, value: values.fields[key] as string | number });
    } else if (!warnedMissing.has(`${sub}:${name}`)) {
      warnedMissing.add(`${sub}:${name}`);
      console.warn(`[ghl-deal-sync] contact custom field "${name}" not found (sub=${sub}) — run scripts/ghl-setup-proposal-fields.mjs`);
    }
  }
  if (values.links) {
    const linkIds = new Map<number, string>();
    for (const f of fields) {
      const n = proposalLinkIndex(f.name);
      if (n !== null && !linkIds.has(n)) linkIds.set(n, f.id);
    }
    for (let n = 1; n <= values.links.length; n++) {
      const id = linkIds.get(n) ?? (await ensureLinkField(n, sub));
      if (id) writes.push({ name: proposalLinkFieldName(n), id, value: values.links[n - 1] });
    }
    // Slots this proposal doesn't use any more (fewer open contracts than a
    // previous send) are cleared, so no follow-up carries a dead link.
    for (const [n, id] of Array.from(linkIds)) {
      if (n > values.links.length) writes.push({ name: proposalLinkFieldName(n), id, value: "" });
    }
  }
  if (writes.length === 0) return;
  const observed = await updateContactCustomFields(
    target.contactId,
    writes.map(({ id, value }) => ({ id, value })),
    sub
  );
  const failed = writes.filter((w) => !verified(w, observed.get(w.id) ?? "")).map((w) => w.name);
  if (failed.length > 0) {
    // Field names only — the values are signing links / money.
    console.warn(`[ghl-deal-sync] proposal field(s) did not verify after the write (sub=${sub}): ${failed.join(", ")}`);
  }
}

/** Steps 1 + 2: contact fields, then the opportunity. Each logs its own failure. */
async function applyFieldsAndOpportunity(state: DealState, target: GhlLeadTarget): Promise<void> {
  const { deal, proposal } = state;
  const values = proposalFieldValues(proposal, {
    dealValueCents: deal.dealValue,
    sentDateYmd: proposal.sentAt ? businessTodayYmd(new Date(proposal.sentAt)) : null,
  });
  await writeProposalFields(target, values).catch((err) =>
    console.error(`[ghl-deal-sync] proposal field write failed (sub=${target.subAccountId}):`, describeError(err))
  );

  // Opportunity before the tags: a workflow keyed on proposal_signed then
  // sees an opportunity that is already Won.
  const lead = { leadName: deal.clientName, dealValueCents: deal.dealValue };
  try {
    if (deal.paidStatus === "paid") await syncTargetActiveClient(target, lead);
    else if (proposal.state === "signed") await syncTargetWon(target, lead);
  } catch (err) {
    console.error(`[ghl-deal-sync] opportunity update failed (sub=${target.subAccountId}):`, describeError(err));
  }
}

const nothingToMirror = (s: DealState, opts: DealGhlSyncOptions) =>
  s.proposal.state === "none" && s.deal.paidStatus !== "paid" && !opts.clearIfNone;

/**
 * Bring the lead's GHL contact in line with the proposal state of `dealId` —
 * or of the lead's more recently sent deal, when there is one. Throws only on
 * unexpected errors (DB); GHL failures are logged per step.
 */
export async function syncDealToGhl(dealId: string, opts: DealGhlSyncOptions = {}): Promise<void> {
  if (!isAnyGhlConfigured()) return;
  let state = await loadState(dealId);
  if (!state) return;

  let target: GhlLeadTarget | null | undefined; // undefined = not resolved yet
  if (state.deal.clientEmail) {
    const driving = await drivingDealId(state.deal.clientEmail);
    if (driving && driving !== dealId) {
      const newer = await loadState(driving);
      if (newer && !nothingToMirror(newer, {})) {
        const [own, theirs] = await Promise.all([resolveTarget(state.deal), resolveTarget(newer.deal)]);
        target = own;
        // Hand over only when both deals are the SAME GHL contact — the same
        // email can be a lead in each sub-account, and each contact mirrors
        // its own deals.
        if (own && theirs && sameTarget(own, theirs)) {
          dealId = driving;
          state = newer;
          opts = {}; // the newer deal's own state decides; nothing of it was cleared
        }
      }
    }
  }
  if (nothingToMirror(state, opts)) return; // never sent — no GHL calls at all

  if (target === undefined) target = await resolveTarget(state.deal);
  if (!target) return; // lead not in GHL (or ambiguous — logged)

  // Re-read before the tags and after them: if the deal moved on while we
  // were writing (a view and a signature webhook landing back to back on two
  // instances), redo the run with the newer state — a slower, older run must
  // not add a stale tag (tags fire workflows) or leave one behind. The last
  // pass always writes its tags, so a deal that keeps moving still lands.
  const PASSES = 3;
  for (let pass = 1; pass <= PASSES; pass++) {
    await applyFieldsAndOpportunity(state, target);
    const beforeTags = await loadState(dealId);
    if (!beforeTags) return;
    if (stateKey(beforeTags) !== stateKey(state) && pass < PASSES) {
      state = beforeTags;
      continue;
    }
    state = beforeTags;
    const plan = proposalTagPlan(state.proposal.state);
    await applyTags(target, plan.add, plan.remove);
    const after = await loadState(dealId);
    if (!after || stateKey(after) === stateKey(state)) return;
    state = after;
  }
}

/** What a deal looked like for GHL — captured BEFORE deleting it (its
 *  contracts are deleted with it). */
export async function snapshotDealForGhl(dealId: string): Promise<DealState | null> {
  if (!isAnyGhlConfigured()) return null;
  return loadState(dealId).catch(() => null);
}

/**
 * After a deal is deleted: if it had an OPEN proposal, the lead's contact must
 * not keep running follow-ups for it. Mirror the lead's next most recently
 * active deal on the same contact; with none left, clear the links/status and
 * drop the open tags.
 */
async function syncAfterDealDeleted(snapshot: DealState): Promise<void> {
  const open = snapshot.proposal.state === "sent" || snapshot.proposal.state === "viewed";
  if (!open) return;
  // The deal row is gone, so the related-deal fallback naturally excludes it.
  const target = await resolveTarget(snapshot.deal);
  if (!target) return;
  const email = snapshot.deal.clientEmail;
  if (email) {
    const nextId = await drivingDealId(email, snapshot.deal.id);
    const next = nextId ? await loadState(nextId) : null;
    if (next) {
      const theirs = await resolveTarget(next.deal);
      if (theirs && sameTarget(theirs, target)) return syncDealToGhl(next.deal.id);
    }
  }
  const none: DerivedProposal = { state: "none", links: [], sentAt: null };
  await writeProposalFields(target, proposalFieldValues(none, { dealValueCents: null, sentDateYmd: null })).catch((err) =>
    console.error(`[ghl-deal-sync] proposal field clear failed (sub=${target.subAccountId}):`, describeError(err))
  );
  const plan = proposalTagPlan("none");
  await applyTags(target, plan.add, plan.remove);
}

// One run per deal at a time within a process (webhooks for one submission
// often arrive in bursts: form.started + form.viewed).
const chains = new Map<string, Promise<void>>();

function enqueue(key: string, reason: string, run: () => Promise<void>): void {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev
    .then(run)
    .catch((err) => console.error(`[ghl-deal-sync] sync failed (${reason}):`, describeError(err)));
  chains.set(key, next);
  void next.finally(() => {
    if (chains.get(key) === next) chains.delete(key);
  });
  waitUntil(next);
}

/**
 * Background `syncDealToGhl` (kept alive via waitUntil). Never throws into
 * the caller. Call after any write that changes a deal's contracts.
 */
export function scheduleDealGhlSync(dealId: string, reason: string, opts: DealGhlSyncOptions = {}): void {
  enqueue(dealId, reason, () => syncDealToGhl(dealId, opts));
}

/** Background follow-up to a deal deletion — pass `snapshotDealForGhl(id)`
 *  taken before the delete. No-op for null. */
export function scheduleDeletedDealGhlSync(snapshot: DealState | null): void {
  if (!snapshot) return;
  enqueue(snapshot.deal.id, "deal deleted", () => syncAfterDealDeleted(snapshot));
}
