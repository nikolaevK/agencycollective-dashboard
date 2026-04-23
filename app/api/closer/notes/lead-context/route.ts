export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { ensureMigrated, getDb } from "@/lib/db";
import { getCalendarEvents } from "@/lib/google/calendar";
import { getDealInvoiceStatuses } from "@/lib/dealInvoices";
import { getDealContractStatuses } from "@/lib/dealContracts";

/**
 * Aggregate everything known about a lead the user has linked to a note:
 * - Google Calendar event (title, description, attendees, meet link, location)
 * - Every appointment claim tied to that event (each setter's flags + notes)
 * - Every deal tied to that event OR specified by dealId
 * - Every show/no-show attendance mark for that event
 *
 * Read-only, ordered newest-first. Session-gated only — no ownership check,
 * because any team member who legitimately sees the note's linked-lead chip
 * should also see the rest of the lead's history.
 */
export async function GET(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const googleEventId = searchParams.get("googleEventId");
  const dealId = searchParams.get("dealId");

  if (!googleEventId && !dealId) {
    return NextResponse.json(
      { error: "Either googleEventId or dealId is required" },
      { status: 400 }
    );
  }

  await ensureMigrated();
  const db = getDb();

  // Resolve googleEventId via the deal if only dealId was passed.
  let resolvedEventId = googleEventId;
  if (!resolvedEventId && dealId) {
    const dealLookup = await db.execute({
      sql: "SELECT google_event_id FROM deals WHERE id = ?",
      args: [dealId],
    });
    const row = dealLookup.rows[0];
    if (row?.google_event_id != null) {
      resolvedEventId = String(row.google_event_id);
    }
  }

  // Queries in parallel — no dependency between them.
  const [appointmentsRes, dealsRes, attendanceRes] = await Promise.all([
    resolvedEventId
      ? db.execute({
          sql: `SELECT a.id, a.setter_id, a.client_name, a.client_email,
                       a.scheduled_at, a.pre_call_status, a.post_call_status,
                       a.notes, a.created_at, a.updated_at,
                       c.display_name AS setter_name
                  FROM appointments a
                  LEFT JOIN closers c ON c.id = a.setter_id
                 WHERE a.google_event_id = ?
              ORDER BY a.updated_at DESC`,
          args: [resolvedEventId],
        })
      : Promise.resolve({ rows: [] }),
    // Deals tied to this event OR explicitly requested by id.
    db.execute({
      sql: `SELECT d.id, d.closer_id, d.setter_id, d.client_name, d.client_email,
                   d.deal_value, d.status, d.paid_status, d.closing_date,
                   d.service_category, d.industry, d.brand_name, d.website,
                   d.notes, d.google_event_id, d.created_at, d.updated_at,
                   cc.display_name AS closer_name,
                   sc.display_name AS setter_name
              FROM deals d
              LEFT JOIN closers cc ON cc.id = d.closer_id
              LEFT JOIN closers sc ON sc.id = d.setter_id
             WHERE (? IS NOT NULL AND d.google_event_id = ?)
                OR (? IS NOT NULL AND d.id = ?)
          ORDER BY d.updated_at DESC`,
      args: [resolvedEventId, resolvedEventId, dealId, dealId],
    }),
    resolvedEventId
      ? db.execute({
          sql: `SELECT ea.google_event_id, ea.closer_id, ea.show_status,
                       ea.created_at, ea.updated_at,
                       c.display_name AS closer_name
                  FROM event_attendance ea
                  LEFT JOIN closers c ON c.id = ea.closer_id
                 WHERE ea.google_event_id = ?
              ORDER BY ea.updated_at DESC`,
          args: [resolvedEventId],
        })
      : Promise.resolve({ rows: [] }),
  ]);

  // Fetch invoice + contract status for the surfaced deals so the UI can
  // render the same status badges that appear elsewhere.
  const dealIds = dealsRes.rows.map((r) => String(r.id));
  const [invoiceStatuses, contractStatuses] = await Promise.all([
    getDealInvoiceStatuses(dealIds),
    getDealContractStatuses(dealIds),
  ]);

  // Fetch the Google Calendar event. Bounded 2-year window uses the shared
  // cache (TTL.GOOGLE_EVENTS), so per-lead lookups are cheap.
  let event = null;
  if (resolvedEventId) {
    try {
      const now = Date.now();
      const timeMin = new Date(now - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      const events = await getCalendarEvents(timeMin, timeMax);
      event = events.find((e) => e.id === resolvedEventId) ?? null;
    } catch (err) {
      console.error("[lead-context] Google fetch failed:", err);
    }
  }

  return NextResponse.json({
    data: {
      googleEventId: resolvedEventId,
      event,
      appointments: appointmentsRes.rows.map((row) => ({
        id: String(row.id),
        setterId: String(row.setter_id),
        setterName: row.setter_name != null ? String(row.setter_name) : null,
        clientName: row.client_name != null ? String(row.client_name) : null,
        clientEmail: row.client_email != null ? String(row.client_email) : null,
        scheduledAt: row.scheduled_at != null ? String(row.scheduled_at) : null,
        preCallStatus: String(row.pre_call_status),
        postCallStatus: String(row.post_call_status),
        notes: row.notes != null ? String(row.notes) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })),
      deals: dealsRes.rows.map((row) => ({
        id: String(row.id),
        closerId: String(row.closer_id),
        closerName: row.closer_name != null ? String(row.closer_name) : null,
        setterId: row.setter_id != null ? String(row.setter_id) : null,
        setterName: row.setter_name != null ? String(row.setter_name) : null,
        clientName: String(row.client_name ?? ""),
        clientEmail: row.client_email != null ? String(row.client_email) : null,
        dealValue: Number(row.deal_value ?? 0),
        status: String(row.status),
        paidStatus: String(row.paid_status ?? "unpaid"),
        closingDate: row.closing_date != null ? String(row.closing_date) : null,
        serviceCategory: row.service_category != null ? String(row.service_category) : null,
        industry: row.industry != null ? String(row.industry) : null,
        brandName: row.brand_name != null ? String(row.brand_name) : null,
        website: row.website != null ? String(row.website) : null,
        notes: row.notes != null ? String(row.notes) : null,
        googleEventId: row.google_event_id != null ? String(row.google_event_id) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        invoiceStatus: invoiceStatuses[String(row.id)]?.status ?? null,
        invoiceNumber: invoiceStatuses[String(row.id)]?.invoiceNumber ?? null,
        contractStatus: contractStatuses[String(row.id)]?.status ?? null,
      })),
      attendance: attendanceRes.rows.map((row) => ({
        closerId: String(row.closer_id),
        closerName: row.closer_name != null ? String(row.closer_name) : null,
        showStatus: String(row.show_status),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })),
    },
  });
}
