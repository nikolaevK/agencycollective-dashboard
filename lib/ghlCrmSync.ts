// GHL CRM funnel sync — pipeline stage, opportunity value/status + contact tags.
//
// Separate from lib/attendanceSync.ts on purpose: that module keeps GHL's
// appointmentStatus in step with the dashboard's show/no-show axis. THIS
// module drives the agency's sales funnel in GHL based on dashboard events:
//
//   - Closer marks "showed" OR a deal is linked to the event
//        → tag the contact `showed_didnt_close`, move their opportunity into
//          the "Showed didn't close" stage and stamp the deal value on it.
//          Never moves a Won / "Active Client" opportunity back down.
//   - The deal's proposal is signed (lib/ghlDealSync.ts)
//        → the opportunity is marked Won with the deal value (stage kept).
//   - The linked deal is marked "paid" (admin dashboard)
//        → swap the tag (`showed_didnt_close` → `active_client`), move the
//          opportunity into "Active Client" and mark it Won with the value.
//
// Pipeline differs per sub-account (Agency Collective uses "MASTER PIPELINE",
// Peptide Ads uses "Website Leads"); stage + tag names are shared.
//
// Bridging a deal to its GHL contact (resolveDealGhlContact):
//   1. the deal's own calendar event → `ghl_appointment_links` row
//      (composite-key matched + sub-account-stamped);
//   2. dashboard deals only (`dealId` + `clientEmail` given): another deal for
//      the same client email whose event IS linked — a deal recreated from an
//      earlier one (revised contract) carries no event, and the original still
//      holds it;
//   3. GHL's exact duplicate-contact lookup by email across the configured
//      sub-accounts — used only when exactly ONE sub-account has the contact.
// Closer-portal call sites pass the event only, so a non-GHL event stays a
// no-op exactly as before. Everything here is best-effort: it never throws
// and never blocks (or rolls back) the dashboard write that triggered it.

import { describeError, isGhlConfigured } from "./ghl/client";
import { ensureLinkForEvent } from "./attendanceSync";
import { listLinksByGoogleEventIds } from "./ghlAppointmentLinks";
import { resolvePipelineStageByName } from "./ghl/pipelines";
import {
  findOpportunityForContactInPipeline,
  createOpportunity,
  updateOpportunity,
} from "./ghl/opportunities";
import {
  addContactTags,
  removeContactTags,
  getContactById,
  findContactByEmail,
} from "./ghl/contacts";
import { getConfiguredSubAccountIds, SUB_ACCOUNTS, type GhlSubAccountId } from "./ghl/subAccounts";
import { ghlMonetaryValue } from "./ghlDealRules";
import { getDb, ensureMigrated } from "./db";

// Pipeline name per sub-account. `Record<GhlSubAccountId, …>` so adding a third
// sub-account to the registry forces a pipeline name to be supplied here.
const PIPELINE_NAME_BY_SUB: Record<GhlSubAccountId, string> = {
  agency: "MASTER PIPELINE",
  peptide: "Website Leads",
};

// Stage names are identical across both pipelines.
const STAGE_SHOWED_DIDNT_CLOSE = "Showed didn't close";
const STAGE_ACTIVE_CLIENT = "Active Client";

const TAG_SHOWED_DIDNT_CLOSE = "showed_didnt_close";
const TAG_ACTIVE_CLIENT = "active_client";

/** What the dashboard knows about the lead behind a deal / calendar event. */
export interface DealGhlIdentity {
  googleEventId?: string | null;
  /** Title/start/end let `ensureLinkForEvent` resolve a brand-new GHL link via
   *  composite key on first sight. Omit them and sync only fires for events
   *  that already have a stored link row. */
  title?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  /** Dashboard deals: with `clientEmail`, enables the related-deal + email
   *  fallbacks for a deal with no GHL-linked event. */
  dealId?: string | null;
  clientEmail?: string | null;
}

export interface GhlLeadTarget {
  contactId: string;
  subAccountId: GhlSubAccountId;
  via: "event" | "related_deal" | "email";
}

/** Resolve the GHL contact (and its sub-account) a deal belongs to, or null
 *  when the lead can't be found unambiguously. See the header for the order. */
export async function resolveDealGhlContact(id: DealGhlIdentity): Promise<GhlLeadTarget | null> {
  if (id.googleEventId) {
    const link = await ensureLinkForEvent({
      googleEventId: id.googleEventId,
      title: id.title ?? null,
      startTime: id.startTime ?? null,
      endTime: id.endTime ?? null,
    });
    if (link) {
      // A link's stamped sub-account is authoritative and never re-resolved:
      // an unusable link (sub-account unconfigured, no contact) means "don't
      // sync", never "go find this lead somewhere else".
      if (link.ghlContactId && isGhlConfigured(link.subAccountId)) {
        return { contactId: link.ghlContactId, subAccountId: link.subAccountId, via: "event" };
      }
      if (!link.ghlContactId) {
        console.warn(
          `[ghl-crm] no GHL contactId on link for googleEventId=${id.googleEventId} (sub=${link.subAccountId})`
        );
      }
      return null;
    }
  }

  const email = (id.clientEmail ?? "").trim();
  if (!id.dealId || !email) return null;

  const related = await relatedDealEventTarget(id.dealId, email);
  if (related === "stop") return null;
  if (related) return related;

  return emailTarget(email);
}

function contactHasEmail(contact: { email?: string | null; additionalEmails?: string[] }, email: string): boolean {
  const want = email.trim().toLowerCase();
  return [contact.email, ...(contact.additionalEmails ?? [])].some((e) => (e ?? "").trim().toLowerCase() === want);
}

/**
 * A linked event on another deal for the same client email (newest first).
 * The linked GHL contact must itself carry that email — a shared / placeholder
 * address typed on two different leads' deals must not hand one lead's signing
 * link to the other. "stop" = the lead's home sub-account is known but
 * unusable (unconfigured / lookup failed): don't fall back to an email search.
 */
async function relatedDealEventTarget(dealId: string, email: string): Promise<GhlLeadTarget | "stop" | null> {
  await ensureMigrated();
  const rows = await getDb().execute({
    sql: `SELECT google_event_id FROM deals
           WHERE id != ? AND google_event_id IS NOT NULL AND client_email = ? COLLATE NOCASE
           ORDER BY created_at DESC LIMIT 10`,
    args: [dealId, email],
  });
  const eventIds = rows.rows.map((r) => String(r.google_event_id)).filter(Boolean);
  if (eventIds.length === 0) return null;
  const links = await listLinksByGoogleEventIds(eventIds);
  for (const eventId of eventIds) {
    const link = links[eventId];
    if (!link?.ghlContactId) continue;
    if (!isGhlConfigured(link.subAccountId)) return "stop";
    let contact;
    try {
      contact = await getContactById(link.ghlContactId, link.subAccountId);
    } catch (err) {
      console.error(`[ghl-crm] related-deal contact lookup failed (sub=${link.subAccountId}):`, describeError(err));
      return "stop";
    }
    if (contact && contactHasEmail(contact, email)) {
      return { contactId: link.ghlContactId, subAccountId: link.subAccountId, via: "related_deal" };
    }
  }
  return null;
}

/** Exact email match in exactly one sub-account. Only when EVERY registered
 *  sub-account is configured — with one missing, "exactly one match" proves
 *  nothing. Fails closed for the same reason if any lookup errors. */
async function emailTarget(email: string): Promise<GhlLeadTarget | null> {
  const subs = getConfiguredSubAccountIds();
  if (subs.length !== SUB_ACCOUNTS.length) return null;
  const hits = await Promise.all(
    subs.map(async (sub) => {
      try {
        const contact = await findContactByEmail(email, sub);
        return contact ? { contactId: contact.id, subAccountId: sub } : null;
      } catch (err) {
        console.error(`[ghl-crm] contact lookup by email failed (sub=${sub}):`, describeError(err));
        return "error" as const;
      }
    })
  );
  if (hits.includes("error")) return null;
  const found = hits.filter((h): h is { contactId: string; subAccountId: GhlSubAccountId } => !!h && h !== "error");
  if (found.length === 1) return { ...found[0], via: "email" };
  if (found.length > 1) {
    console.warn(
      `[ghl-crm] the deal's client email matches a contact in ${found.length} sub-accounts (${found
        .map((f) => f.subAccountId)
        .join(", ")}); skipping CRM sync rather than guessing`
    );
  }
  return null;
}

interface StageSync {
  stageName: string;
  addTags: string[];
  removeTags: string[];
  leadName?: string | null;
  dealValueCents?: number | null;
  /** Force the opportunity status (e.g. "won"); otherwise it's preserved. */
  status?: "won";
  /** Skip everything when the opportunity is already Won / Active Client —
   *  a later "showed" signal must never move a client back down the funnel. */
  neverRegress?: boolean;
  /** Level-based callers (the proposal sync re-runs on every contract event /
   *  Sync click): act only on a still-OPEN opportunity, so a re-run never
   *  undoes a person's later move (lost, churned, another stage). */
  onlyIfOpen?: boolean;
}

/** GHL reports open opportunities as "open" (older rows: empty). */
function isOpenOpp(opp: { status: string | null | undefined }): boolean {
  return !opp.status || opp.status === "open";
}

/**
 * Core: move the target contact's opportunity into `stageName` (updating an
 * existing opportunity in the funnel pipeline, else creating one), stamp the
 * deal value, and apply the tag changes. Throws on hard failures — the
 * exported wrappers catch and log.
 */
async function syncTargetToStage(target: GhlLeadTarget, input: StageSync): Promise<void> {
  const sub = target.subAccountId;
  const contactId = target.contactId;
  const pipelineName = PIPELINE_NAME_BY_SUB[sub];
  const resolved = await resolvePipelineStageByName(pipelineName, input.stageName, sub);
  if (!resolved) return; // resolvePipelineStageByName already logged what was missing
  const monetaryValue = ghlMonetaryValue(input.dealValueCents) ?? undefined;

  // Move-or-create the opportunity inside the target pipeline. Caught on its
  // own so a stage-move failure (GHL hiccup, validation) doesn't suppress the
  // tag write below — the two are independent funnel signals.
  try {
    const existing = await findOpportunityForContactInPipeline(contactId, resolved.pipelineId, sub);
    if (existing) {
      if (input.neverRegress && (await isAdvanced(existing, sub))) return;
      if (input.onlyIfOpen && !isOpenOpp(existing)) return;
      await updateOpportunity(
        existing.id,
        {
          pipelineId: resolved.pipelineId,
          pipelineStageId: resolved.pipelineStageId,
          // Preserve the opportunity's current open/won/lost status unless
          // this transition decides it (signed / paid → won).
          status: input.status ?? (existing.status || "open"),
          // Round-trip the existing name so a PUT that validates required
          // fields doesn't blank it out.
          name: existing.name ?? undefined,
          // A Won opportunity keeps its value: a later (upsell) deal being
          // paid must not replace the value the lead was won at.
          monetaryValue: existing.status === "won" ? undefined : monetaryValue,
        },
        sub
      );
    } else {
      await createOpportunity(
        {
          contactId,
          pipelineId: resolved.pipelineId,
          pipelineStageId: resolved.pipelineStageId,
          name: await resolveOpportunityName(input.leadName, contactId, sub),
          status: input.status,
          monetaryValue,
        },
        sub
      );
    }
  } catch (err) {
    console.error(`[ghl-crm] opportunity stage move failed (sub=${sub}):`, describeError(err));
  }

  await applyTags(target, input.addTags, input.removeTags);
}

/** Won, or already in "Active Client". */
async function isAdvanced(
  opp: { status: string | null | undefined; pipelineStageId: string },
  sub: GhlSubAccountId
): Promise<boolean> {
  if (opp.status === "won") return true;
  const active = await resolvePipelineStageByName(PIPELINE_NAME_BY_SUB[sub], STAGE_ACTIVE_CLIENT, sub);
  return !!active && opp.pipelineStageId === active.pipelineStageId;
}

/** Tags are applied independently of the opportunity write (and each other)
 *  so one failure can't undo the others. Each is caught individually. */
export async function applyTags(target: GhlLeadTarget, add: string[], remove: string[]): Promise<void> {
  const sub = target.subAccountId;
  if (add.length) {
    await addContactTags(target.contactId, add, sub).catch((err) =>
      console.error(`[ghl-crm] addContactTags failed (sub=${sub}):`, describeError(err))
    );
  }
  if (remove.length) {
    await removeContactTags(target.contactId, remove, sub).catch((err) =>
      console.error(`[ghl-crm] removeContactTags failed (sub=${sub}):`, describeError(err))
    );
  }
}

/** GHL requires a `name` on opportunity creation. Prefer the caller-supplied
 *  lead name (deal client name / event title); fall back to the GHL contact's
 *  own name/email; last resort a generic placeholder. */
async function resolveOpportunityName(
  leadName: string | null | undefined,
  contactId: string,
  sub: GhlSubAccountId
): Promise<string> {
  const provided = (leadName ?? "").trim();
  if (provided) return provided;
  const contact = await getContactById(contactId, sub).catch(() => null);
  const fromContact =
    contact?.contactName?.trim() ||
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ").trim() ||
    contact?.email ||
    "";
  return fromContact || "Lead";
}

type LeadSyncInput = DealGhlIdentity & { leadName?: string | null; dealValueCents?: number | null };

async function syncIdentityToStage(input: LeadSyncInput, stage: Omit<StageSync, "leadName" | "dealValueCents">) {
  if (!isGhlConfigured()) return;
  const target = await resolveDealGhlContact(input);
  if (!target) return; // non-GHL lead — nothing to sync
  await syncTargetToStage(target, {
    ...stage,
    leadName: input.leadName ?? null,
    dealValueCents: input.dealValueCents ?? null,
  });
}

/**
 * Closer marked "showed" / a deal was linked to this event. Tag the contact
 * `showed_didnt_close` and move their opportunity into the matching stage with
 * the deal value — unless it's already Won / an Active Client. Best-effort:
 * never throws, never blocks the dashboard write.
 */
export async function bestEffortSyncShowedDidntClose(input: LeadSyncInput): Promise<void> {
  try {
    await syncIdentityToStage(input, {
      stageName: STAGE_SHOWED_DIDNT_CLOSE,
      addTags: [TAG_SHOWED_DIDNT_CLOSE],
      removeTags: [],
      neverRegress: true,
    });
  } catch (err) {
    console.error("[ghl-crm] showed_didnt_close sync failed:", describeError(err));
  }
}

/**
 * Deal was marked "paid". Swap the contact's tag (`showed_didnt_close` →
 * `active_client`), move their opportunity into "Active Client" and mark it
 * Won with the deal value. Best-effort: never throws, never blocks the write.
 */
export async function bestEffortSyncActiveClient(input: LeadSyncInput): Promise<void> {
  try {
    await syncIdentityToStage(input, {
      stageName: STAGE_ACTIVE_CLIENT,
      addTags: [TAG_ACTIVE_CLIENT],
      removeTags: [TAG_SHOWED_DIDNT_CLOSE],
      status: "won",
    });
  } catch (err) {
    console.error("[ghl-crm] active_client sync failed:", describeError(err));
  }
}

/** bestEffortSyncActiveClient for an already-resolved contact, but only while
 *  its opportunity is still OPEN (or missing) — the proposal sync's heal for a
 *  paid deal whose paid edge never reached GHL. Throws — the caller
 *  (lib/ghlDealSync.ts) owns error handling. */
export function syncTargetActiveClient(
  target: GhlLeadTarget,
  lead: { leadName?: string | null; dealValueCents?: number | null }
): Promise<void> {
  return syncTargetToStage(target, {
    stageName: STAGE_ACTIVE_CLIENT,
    addTags: [TAG_ACTIVE_CLIENT],
    removeTags: [TAG_SHOWED_DIDNT_CLOSE],
    status: "won",
    onlyIfOpen: true,
    ...lead,
  });
}

/**
 * The lead signed: mark their funnel opportunity Won with the deal value,
 * keeping its stage (paid moves it to "Active Client" later). With no
 * opportunity in the funnel pipeline yet, one is created in "Showed didn't
 * close" — they showed and closed. Only an OPEN opportunity is changed: a
 * re-run must not flip a person's "lost" back, or rewrite a Won one's value.
 * Throws — the caller owns error handling.
 */
export async function syncTargetWon(
  target: GhlLeadTarget,
  lead: { leadName?: string | null; dealValueCents?: number | null }
): Promise<void> {
  const sub = target.subAccountId;
  const pipelineName = PIPELINE_NAME_BY_SUB[sub];
  const fallbackStage = await resolvePipelineStageByName(pipelineName, STAGE_SHOWED_DIDNT_CLOSE, sub);
  if (!fallbackStage) return;
  const monetaryValue = ghlMonetaryValue(lead.dealValueCents) ?? undefined;
  const existing = await findOpportunityForContactInPipeline(target.contactId, fallbackStage.pipelineId, sub);
  if (existing) {
    if (!isOpenOpp(existing)) return;
    await updateOpportunity(
      existing.id,
      {
        pipelineId: existing.pipelineId || fallbackStage.pipelineId,
        pipelineStageId: existing.pipelineStageId || fallbackStage.pipelineStageId,
        status: "won",
        name: existing.name ?? undefined,
        monetaryValue,
      },
      sub
    );
    return;
  }
  await createOpportunity(
    {
      contactId: target.contactId,
      pipelineId: fallbackStage.pipelineId,
      pipelineStageId: fallbackStage.pipelineStageId,
      name: await resolveOpportunityName(lead.leadName, target.contactId, sub),
      status: "won",
      monetaryValue,
    },
    sub
  );
}
