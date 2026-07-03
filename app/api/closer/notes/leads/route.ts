export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveCloserSession } from "@/lib/closerGuards";
import { getDb, ensureMigrated } from "@/lib/db";
import { getCalendarEvents } from "@/lib/google/calendar";

export interface NoteLead {
  label: string;              // client name for display
  subLabel: string | null;    // scheduled time or deal context
  googleEventId: string | null;
  dealId: string | null;
  clientEmail: string | null;
  kind: "appointment" | "deal" | "no_show" | "showed";
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
  const session = await getActiveCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureMigrated();
  const db = getDb();

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

  const isSetter = session.role === "setter";

  // Independent queries — run them concurrently instead of stacking four
  // sequential Turso round-trips; push order below stays deterministic.
  const dealsSql = isSetter
    ? `SELECT id, client_name, client_email, deal_value, google_event_id, closing_date, status
         FROM deals WHERE setter_id = ? OR closer_id = ?
         ORDER BY created_at DESC LIMIT 500`
    : `SELECT id, client_name, client_email, deal_value, google_event_id, closing_date, status
         FROM deals WHERE closer_id = ?
         ORDER BY created_at DESC LIMIT 500`;
  const dealsArgs = isSetter ? [session.closerId, session.closerId] : [session.closerId];
  // Setters see team-wide attendance; closers only the events they marked.
  // Status is parameterized (not interpolated) per CLAUDE.md's no-string-
  // concatenation rule, even though TS narrows it to two literals.
  const attendanceSql = isSetter
    ? `SELECT DISTINCT ea.google_event_id,
              COALESCE(a.client_name, d.client_name) AS client_name,
              COALESCE(a.client_email, d.client_email) AS client_email,
              COALESCE(a.scheduled_at, d.closing_date) AS scheduled_at,
              ea.updated_at
         FROM event_attendance ea
         LEFT JOIN appointments a ON a.google_event_id = ea.google_event_id
         LEFT JOIN deals d ON d.google_event_id = ea.google_event_id
         WHERE ea.show_status = ?
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
         WHERE ea.show_status = ? AND ea.closer_id = ?
         ORDER BY ea.updated_at DESC
         LIMIT 500`;

  const [appts, dealsRes, showedRes, noShowRes] = await Promise.all([
    isSetter
      ? db.execute({
          sql: `SELECT google_event_id, client_name, client_email, scheduled_at
                  FROM appointments
                 WHERE setter_id = ?
                 ORDER BY updated_at DESC
                 LIMIT 500`,
          args: [session.closerId],
        })
      : Promise.resolve(null),
    db.execute({ sql: dealsSql, args: dealsArgs }),
    db.execute({ sql: attendanceSql, args: isSetter ? ["showed"] : ["showed", session.closerId] }),
    db.execute({ sql: attendanceSql, args: isSetter ? ["no_show"] : ["no_show", session.closerId] }),
  ]);

  // 1. User's own claimed appointments (setters)
  if (appts) {
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

  // 3+4. Attendance-marked events, pushed in order showed → no_show so a
  // setter following up sees the no-show context last (most actionable) but
  // neither hides the other from the picker.
  for (const { status, res } of [
    { status: "showed" as const, res: showedRes },
    { status: "no_show" as const, res: noShowRes },
  ]) {
    const placeholder = status === "showed" ? "Showed" : "No-show";
    for (const row of res.rows) {
      pushLead({
        // Placeholder when we don't have appointment/deal client info yet.
        // Enriched below from Google Calendar before we respond.
        label: row.client_name != null ? String(row.client_name) : placeholder,
        subLabel: row.scheduled_at != null ? String(row.scheduled_at) : null,
        googleEventId: String(row.google_event_id),
        dealId: null,
        clientEmail: row.client_email != null ? String(row.client_email) : null,
        kind: status,
      });
    }
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
    (l) =>
      l.googleEventId &&
      (l.label === "No-show" ||
        l.label === "Showed" ||
        l.label === "Appointment" ||
        l.label === "Deal" ||
        !l.clientEmail)
  );
  if (needsEnrichment.length > 0) {
    try {
      // 90-day window matches the no-show enrichment cap (older leads keep
      // their placeholder labels rather than widening every fetch to years
      // of events). Rounded to UTC day boundaries so concurrent loads share
      // one getCalendarEvents cache key (ms-precision bounds would make the
      // 2-min Google cache useless across requests).
      const dayMs = 24 * 60 * 60 * 1000;
      const todayMs = Math.floor(Date.now() / dayMs) * dayMs;
      const timeMin = new Date(todayMs - 90 * dayMs).toISOString();
      const timeMax = new Date(todayMs + dayMs).toISOString();
      const events = await getCalendarEvents(timeMin, timeMax);
      const byId = new Map(events.map((e) => [e.id, e]));
      for (const lead of bounded) {
        if (!lead.googleEventId) continue;
        const evt = byId.get(lead.googleEventId);
        if (!evt) continue;
        if (
          lead.label === "No-show" ||
          lead.label === "Showed" ||
          lead.label === "Appointment" ||
          lead.label === "Deal"
        ) {
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
