export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { findCloser } from "@/lib/closers";
import { getDb, ensureMigrated } from "@/lib/db";
import { getCalendarEvents } from "@/lib/google/calendar";

export interface NoteLead {
  label: string;              // client name for display
  subLabel: string | null;    // scheduled time or deal context
  googleEventId: string | null;
  dealId: string | null;
  clientEmail: string | null;
  kind: "appointment" | "deal" | "no_show";
}

/**
 * Return the lead pool the logged-in user can attach a note to.
 * - Setters: their claimed appointments + all team-wide no-shows + deals they're credited on.
 * - Closers: their own deals + events they marked attendance on.
 *
 * Deduped by googleEventId where possible (falling back to dealId). Client
 * does free-text search over the returned list — no server-side filtering
 * to keep the endpoint simple. Bounded at 300 items.
 */
export async function GET() {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureMigrated();
  const db = getDb();
  const closer = await findCloser(session.closerId);
  if (!closer) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const leads: NoteLead[] = [];
  const seenEventIds = new Set<string>();
  const seenDealIds = new Set<string>();

  const pushLead = (lead: NoteLead) => {
    // Prefer the most informative row per unique key. Later rows for the
    // same (event or deal) are skipped.
    if (lead.googleEventId) {
      if (seenEventIds.has(lead.googleEventId)) return;
      seenEventIds.add(lead.googleEventId);
    } else if (lead.dealId) {
      if (seenDealIds.has(lead.dealId)) return;
      seenDealIds.add(lead.dealId);
    }
    leads.push(lead);
  };

  const isSetter = closer.role === "setter";

  // 1. User's own claimed appointments (setters)
  if (isSetter) {
    const appts = await db.execute({
      sql: `SELECT google_event_id, client_name, client_email, scheduled_at
              FROM appointments
             WHERE setter_id = ?
             ORDER BY updated_at DESC
             LIMIT 500`,
      args: [session.closerId],
    });
    for (const row of appts.rows) {
      const clientName = row.client_name != null ? String(row.client_name) : "Appointment";
      pushLead({
        label: clientName,
        subLabel: row.scheduled_at != null ? String(row.scheduled_at) : null,
        googleEventId: String(row.google_event_id),
        dealId: null,
        clientEmail: row.client_email != null ? String(row.client_email) : null,
        kind: "appointment",
      });
    }
  }

  // 2. Deals owned by this user (closer_id) or credited (setter_id)
  const dealsSql = isSetter
    ? `SELECT id, client_name, client_email, deal_value, google_event_id, closing_date, status
         FROM deals WHERE setter_id = ? OR closer_id = ?
         ORDER BY created_at DESC LIMIT 500`
    : `SELECT id, client_name, client_email, deal_value, google_event_id, closing_date, status
         FROM deals WHERE closer_id = ?
         ORDER BY created_at DESC LIMIT 500`;
  const dealsArgs = isSetter ? [session.closerId, session.closerId] : [session.closerId];
  const dealsRes = await db.execute({ sql: dealsSql, args: dealsArgs });
  for (const row of dealsRes.rows) {
    const clientName = String(row.client_name ?? "Deal");
    const dealValueCents = Number(row.deal_value ?? 0);
    const dollars = dealValueCents / 100;
    const status = String(row.status ?? "");
    const subParts = [
      status ? status.replace(/_/g, " ") : null,
      dealValueCents > 0 ? `$${dollars.toLocaleString()}` : null,
      row.closing_date != null ? String(row.closing_date) : null,
    ].filter(Boolean);
    pushLead({
      label: clientName,
      subLabel: subParts.length ? subParts.join(" · ") : null,
      googleEventId: row.google_event_id != null ? String(row.google_event_id) : null,
      dealId: String(row.id),
      clientEmail: row.client_email != null ? String(row.client_email) : null,
      kind: "deal",
    });
  }

  // 3. No-shows the user needs to follow up on. Setters see team-wide;
  //    closers see just the events they marked.
  const noShowSql = isSetter
    ? `SELECT DISTINCT ea.google_event_id,
              COALESCE(a.client_name, d.client_name) AS client_name,
              COALESCE(a.client_email, d.client_email) AS client_email,
              COALESCE(a.scheduled_at, d.closing_date) AS scheduled_at,
              ea.updated_at
         FROM event_attendance ea
         LEFT JOIN appointments a ON a.google_event_id = ea.google_event_id
         LEFT JOIN deals d ON d.google_event_id = ea.google_event_id
         WHERE ea.show_status = 'no_show'
         ORDER BY ea.updated_at DESC
         LIMIT 500`
    : `SELECT DISTINCT ea.google_event_id,
              COALESCE(a.client_name, d.client_name) AS client_name,
              COALESCE(a.client_email, d.client_email) AS client_email,
              COALESCE(a.scheduled_at, d.closing_date) AS scheduled_at,
              ea.updated_at
         FROM event_attendance ea
         LEFT JOIN appointments a ON a.google_event_id = ea.google_event_id
         LEFT JOIN deals d ON d.google_event_id = ea.google_event_id
         WHERE ea.show_status = 'no_show' AND ea.closer_id = ?
         ORDER BY ea.updated_at DESC
         LIMIT 500`;
  const noShowArgs = isSetter ? [] : [session.closerId];
  const noShowRes = await db.execute({ sql: noShowSql, args: noShowArgs });
  for (const row of noShowRes.rows) {
    pushLead({
      // Placeholder when we don't have appointment/deal client info yet.
      // Enriched below from Google Calendar before we respond.
      label: row.client_name != null ? String(row.client_name) : "No-show",
      subLabel: row.scheduled_at != null ? String(row.scheduled_at) : null,
      googleEventId: String(row.google_event_id),
      dealId: null,
      clientEmail: row.client_email != null ? String(row.client_email) : null,
      kind: "no_show",
    });
  }

  // Raised from 300 → 1500 so a setter with deep history can still find old
  // leads. Client-side search narrows the visible list; the picker's scroll
  // container handles the render.
  const bounded = leads.slice(0, 1500);

  // Enrich anything still missing identity info from the Google Calendar
  // event itself. Without this, team-wide no-shows that no setter claimed
  // and no closer linked to a deal would all render as "No-show" — the
  // setter has no way to know whom to call. Same pattern used by the
  // no-show follow-up list (enrichNoShowsFromCalendar).
  const needsEnrichment = bounded.filter(
    (l) => l.googleEventId && (l.label === "No-show" || l.label === "Appointment" || l.label === "Deal" || !l.clientEmail)
  );
  if (needsEnrichment.length > 0) {
    try {
      // Two-year window matches the no-show enrichment; Google calls are
      // cached (TTL.GOOGLE_EVENTS) so repeat loads reuse the response.
      const now = Date.now();
      const timeMin = new Date(now - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      const events = await getCalendarEvents(timeMin, timeMax);
      const byId = new Map(events.map((e) => [e.id, e]));
      for (const lead of bounded) {
        if (!lead.googleEventId) continue;
        const evt = byId.get(lead.googleEventId);
        if (!evt) continue;
        if (lead.label === "No-show" || lead.label === "Appointment" || lead.label === "Deal") {
          lead.label = evt.title;
        }
        if (!lead.clientEmail) {
          lead.clientEmail = evt.attendees[0]?.email ?? null;
        }
        if (!lead.subLabel && evt.start) {
          lead.subLabel = evt.start;
        }
      }
    } catch (err) {
      console.error("[notes/leads] Google enrichment failed:", err);
      // Leave un-enriched; better to ship placeholders than 500 the endpoint.
    }
  }

  return NextResponse.json({ data: bounded });
}
