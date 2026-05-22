// GHL CRM funnel sync — pipeline stage + contact tags.
//
// Separate from lib/attendanceSync.ts on purpose: that module keeps GHL's
// appointmentStatus in step with the dashboard's show/no-show axis. THIS
// module drives the agency's sales funnel in GHL based on dashboard events:
//
//   - Closer marks "showed" OR a deal is linked to the event
//        → tag the contact `showed_didnt_close` and move their opportunity
//          into the "Showed didn't close" pipeline stage.
//   - The linked deal is later marked "paid" (admin dashboard)
//        → swap the tag (`showed_didnt_close` → `active_client`) and move
//          the opportunity into the "Active Client" stage.
//
// Pipeline differs per sub-account (Agency Collective uses "MASTER PIPELINE",
// Peptide Ads uses "Website Leads"); stage + tag names are shared.
//
// Bridging: a dashboard event is tied to a GHL contact through the existing
// `ghl_appointment_links` row (composite-key matched + sub-account-stamped).
// Events with no link row are non-GHL and skipped entirely — identical to the
// attendance-sync no-op path. Everything here is best-effort: it never throws
// and never blocks (or rolls back) the dashboard write that triggered it.

import { describeError, isGhlConfigured } from "./ghl/client";
import { ensureLinkForEvent } from "./attendanceSync";
import { resolvePipelineStageByName } from "./ghl/pipelines";
import {
  findOpportunityForContactInPipeline,
  createOpportunity,
  updateOpportunity,
} from "./ghl/opportunities";
import { addContactTags, removeContactTags, getContactById } from "./ghl/contacts";
import type { GhlSubAccountId } from "./ghl/subAccounts";

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

interface EventCoords {
  googleEventId: string;
  /** Title/start/end let `ensureLinkForEvent` resolve a brand-new GHL link via
   *  composite key on first sight. Omit them and sync only fires for events
   *  that already have a stored link row. */
  title?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

/**
 * Core: resolve the event's GHL contact + sub-account, move that contact's
 * opportunity into `stageName` (updating an existing opportunity in the
 * pipeline, else creating one), and apply the tag changes. Throws on hard
 * failures — the exported wrappers catch and log.
 */
async function syncLeadToStage(input: {
  evt: EventCoords;
  stageName: string;
  addTags: string[];
  removeTags: string[];
  leadName?: string | null;
}): Promise<void> {
  if (!isGhlConfigured()) return;

  const link = await ensureLinkForEvent({
    googleEventId: input.evt.googleEventId,
    title: input.evt.title ?? null,
    startTime: input.evt.startTime ?? null,
    endTime: input.evt.endTime ?? null,
  });
  if (!link) return; // non-GHL event — nothing to sync

  const sub = link.subAccountId;
  if (!isGhlConfigured(sub)) return; // stamped sub-account no longer configured

  const contactId = link.ghlContactId;
  if (!contactId) {
    console.warn(
      `[ghl-crm] no GHL contactId on link for googleEventId=${input.evt.googleEventId} (sub=${sub}); skipping CRM sync`
    );
    return;
  }

  const pipelineName = PIPELINE_NAME_BY_SUB[sub];
  const resolved = await resolvePipelineStageByName(pipelineName, input.stageName, sub);
  if (!resolved) return; // resolvePipelineStageByName already logged what was missing

  // Move-or-create the opportunity inside the target pipeline. Caught on its
  // own so a stage-move failure (GHL hiccup, validation) doesn't suppress the
  // tag write below — the two are independent funnel signals.
  try {
    const existing = await findOpportunityForContactInPipeline(
      contactId,
      resolved.pipelineId,
      sub
    );
    if (existing) {
      await updateOpportunity(
        existing.id,
        {
          pipelineId: resolved.pipelineId,
          pipelineStageId: resolved.pipelineStageId,
          // Preserve the opportunity's current open/won/lost status — we only
          // move it through stages, never decide its win/loss here.
          status: existing.status || "open",
          // Round-trip the existing name so a PUT that validates required
          // fields doesn't blank it out.
          name: existing.name ?? undefined,
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
        },
        sub
      );
    }
  } catch (err) {
    console.error(
      `[ghl-crm] opportunity stage move failed (sub=${sub}):`,
      describeError(err)
    );
  }

  // Tags are applied independently of the opportunity write (and each other)
  // so one failure can't undo the others. Each is caught individually.
  if (input.addTags.length) {
    await addContactTags(contactId, input.addTags, sub).catch((err) =>
      console.error(`[ghl-crm] addContactTags failed (sub=${sub}):`, describeError(err))
    );
  }
  if (input.removeTags.length) {
    await removeContactTags(contactId, input.removeTags, sub).catch((err) =>
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

/**
 * Closer marked "showed" / a deal was linked to this event. Tag the contact
 * `showed_didnt_close` and move their opportunity into the matching stage.
 * Best-effort: never throws, never blocks the dashboard write.
 */
export async function bestEffortSyncShowedDidntClose(
  input: EventCoords & { leadName?: string | null }
): Promise<void> {
  try {
    await syncLeadToStage({
      evt: input,
      stageName: STAGE_SHOWED_DIDNT_CLOSE,
      addTags: [TAG_SHOWED_DIDNT_CLOSE],
      removeTags: [],
      leadName: input.leadName ?? null,
    });
  } catch (err) {
    console.error("[ghl-crm] showed_didnt_close sync failed:", describeError(err));
  }
}

/**
 * Linked deal was marked "paid". Swap the contact's tag
 * (`showed_didnt_close` → `active_client`) and move their opportunity into the
 * "Active Client" stage. Best-effort: never throws, never blocks the write.
 */
export async function bestEffortSyncActiveClient(
  input: EventCoords & { leadName?: string | null }
): Promise<void> {
  try {
    await syncLeadToStage({
      evt: input,
      stageName: STAGE_ACTIVE_CLIENT,
      addTags: [TAG_ACTIVE_CLIENT],
      removeTags: [TAG_SHOWED_DIDNT_CLOSE],
      leadName: input.leadName ?? null,
    });
  } catch (err) {
    console.error("[ghl-crm] active_client sync failed:", describeError(err));
  }
}
