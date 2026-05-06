import cache from "@/lib/cache";
import { ghlRequest, getGhlConfig, describeError } from "./client";
import { getOpportunitiesByContact } from "./opportunities";
import { getAppointmentsByContact } from "./calendars";
import { pickStr, pickBool, pickStringArray, pickIso, cachedSingleflight } from "./util";
import type {
  GhlContact,
  GhlContactAppointment,
  GhlContactBatch,
  GhlContactNote,
} from "@/types/ghl";

// Server-side TTLs.
// `TTL_BATCH_BASE` covers the underlying contact rows + bulk-derived
// enrichment (opportunities, appointments) — those mutate slowly so 5 min
// is fine. Note counts live OUTSIDE this cache so a freshly-added GHL note
// can appear in the list within `TTL_DETAIL` seconds rather than waiting
// out the whole batch TTL.
const TTL_BATCH_BASE = 300;
const TTL_DETAIL = 60;

// GHL search-contacts hard cap is 100. We use the max so each page covers
// the most contacts, minimizing the round-trip count for large tenants.
export const MAX_PAGE_LIMIT = 100;

// ── Normalizers ───────────────────────────────────────────────────────

function normContact(raw: Record<string, unknown>): GhlContact {
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    locationId: pickStr(raw, "locationId", "location_id", "location.id") ?? "",
    firstName: pickStr(raw, "firstName", "first_name"),
    lastName: pickStr(raw, "lastName", "last_name"),
    contactName: pickStr(raw, "contactName", "contact_name", "fullName", "full_name", "name"),
    email: pickStr(raw, "email"),
    phone: pickStr(raw, "phone"),
    additionalEmails: pickStringArray(raw, "additionalEmails", "additional_emails"),
    additionalPhones: pickStringArray(raw, "additionalPhones", "additional_phones"),
    companyName: pickStr(raw, "companyName", "company_name", "company.name"),
    source: pickStr(raw, "source"),
    type: pickStr(raw, "type"),
    tags: pickStringArray(raw, "tags"),
    dateAdded: pickIso(raw, "dateAdded", "date_added", "createdAt", "created_at"),
    dateUpdated: pickIso(raw, "dateUpdated", "date_updated", "updatedAt", "updated_at"),
    country: pickStr(raw, "country"),
    city: pickStr(raw, "city"),
    state: pickStr(raw, "state"),
    postalCode: pickStr(raw, "postalCode", "postal_code"),
    timezone: pickStr(raw, "timezone"),
    assignedTo: pickStr(raw, "assignedTo", "assigned_to", "assignedUserId", "assigned_user_id"),
    dnd: pickBool(raw, "dnd", "doNotDisturb"),
  };
}

function normNote(raw: Record<string, unknown>): GhlContactNote {
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    body: pickStr(raw, "body", "content", "text") ?? "",
    userId: pickStr(raw, "userId", "user_id", "user.id"),
    contactId: pickStr(raw, "contactId", "contact_id", "contact.id") ?? "",
    dateAdded: pickIso(raw, "dateAdded", "date_added", "createdAt", "created_at") ?? "",
  };
}

function normAppointment(raw: Record<string, unknown>): GhlContactAppointment {
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    title: pickStr(raw, "title"),
    contactId: pickStr(raw, "contactId", "contact_id", "contact.id") ?? "",
    calendarId: pickStr(raw, "calendarId", "calendar_id", "calendar.id"),
    locationId: pickStr(raw, "locationId", "location_id"),
    startTime: pickIso(raw, "startTime", "start_time", "startDate", "start"),
    endTime: pickIso(raw, "endTime", "end_time", "endDate", "end"),
    appointmentStatus: pickStr(raw, "appointmentStatus", "appointment_status", "status"),
    assignedUserId: pickStr(raw, "assignedUserId", "assigned_user_id", "assignedTo", "assigned_to"),
    notes: pickStr(raw, "notes"),
    address: pickStr(raw, "address"),
    meetingLocationType: pickStr(raw, "meetingLocationType", "meeting_location_type"),
  };
}

// ── Per-page enriched batch ──────────────────────────────────────────

async function searchContactsPage(
  locationId: string,
  query: string,
  page: number,
  pageLimit: number
): Promise<{ contacts: GhlContact[]; total: number }> {
  // Always newest-first. Pairs with the UI's default "Recently added" sort
  // so that the visible-row order matches the server's pagination order;
  // older contacts are only fetched on demand when the user scrolls.
  const raw = await ghlRequest<{ contacts?: unknown[]; total?: number }>(
    "/contacts/search",
    {
      method: "POST",
      body: {
        locationId,
        page,
        pageLimit,
        query: query || undefined,
        sort: [{ field: "dateAdded", direction: "desc" }],
      },
    }
  );
  return {
    contacts: (raw.contacts ?? []).map((c) => normContact(c as Record<string, unknown>)),
    total: Number(raw.total ?? 0),
  };
}

function summarizeAppointments(
  appts: GhlContactAppointment[]
): {
  next: string | null;
  last: string | null;
  statuses: string[];
} {
  const now = Date.now();
  let nextMs = Infinity;
  let next: string | null = null;
  let lastMs = -Infinity;
  let last: string | null = null;
  const statuses = new Set<string>();
  for (const a of appts) {
    if (a.appointmentStatus) statuses.add(a.appointmentStatus.toLowerCase());
    if (!a.startTime) continue;
    const t = Date.parse(a.startTime);
    if (!Number.isFinite(t)) continue;
    if (t > now && t < nextMs) {
      nextMs = t;
      next = a.startTime;
    } else if (t <= now && t > lastMs) {
      lastMs = t;
      last = a.startTime;
    }
  }
  return { next, last, statuses: Array.from(statuses) };
}

/**
 * Loads a single page of contacts (up to 100), enriched in-place with
 * notes count + appointment summary so the list UI can sort/filter on it.
 *
 * The infinite-query hook calls this repeatedly to walk the entire tenant.
 * Each page is independently cached, so rapid back/forward navigation is
 * effectively free.
 */
export async function getContactBatch(opts: {
  query?: string;
  page?: number;
  pageLimit?: number;
}): Promise<GhlContactBatch> {
  const { locationId } = getGhlConfig();
  const q = (opts.query ?? "").trim();
  const page = Math.max(1, opts.page ?? 1);
  const pageLimit = Math.min(MAX_PAGE_LIMIT, Math.max(1, opts.pageLimit ?? MAX_PAGE_LIMIT));

  // ── BASE batch (cached 5 min, single-flight) ─────────────────────────
  // Holds the search response + bulk-derived enrichment (opportunities,
  // appointments). Excludes note counts so freshly-added notes don't wait
  // out the 5-min TTL to appear in the list.
  const baseKey = `ghl:batch-base:${locationId}:q${q}:p${page}:l${pageLimit}`;
  const base = await cachedSingleflight(baseKey, TTL_BATCH_BASE, async () => {
    const { contacts: rawContacts, total } = await searchContactsPage(locationId, q, page, pageLimit);

    const [oppsByContact, apptsByContact] = await Promise.all([
      getOpportunitiesByContact().catch((err) => {
        console.error("[ghl-contacts] opportunities bulk fetch failed:", describeError(err));
        return new Map();
      }),
      getAppointmentsByContact().catch((err) => {
        console.error("[ghl-contacts] appointments bulk fetch failed:", describeError(err));
        return new Map();
      }),
    ]);

    const enriched: GhlContact[] = rawContacts.map((c) => {
      const appts = apptsByContact.get(c.id) ?? [];
      const { next, last, statuses } = summarizeAppointments(appts);
      return {
        ...c,
        appointmentCount: appts.length,
        nextAppointmentTime: next,
        lastAppointmentTime: last,
        appointmentStatuses: statuses,
        opportunities: oppsByContact.get(c.id) ?? [],
      };
    });

    return { contacts: enriched, total };
  });

  // ── NOTE COUNTS (relies on per-contact 60s cache) ────────────────────
  // Fetched outside the base batch so a fresh note appears within
  // TTL_DETAIL seconds in the list, not the 5-min batch TTL. The
  // underlying `getContactNotes` is itself cached + single-flighted, so
  // these calls are cheap on warm cache.
  const noteCounts = await Promise.all(
    base.contacts.map(async (c) => {
      const count = await getContactNotes(c.id)
        .then((n) => n.length)
        .catch(() => 0);
      return [c.id, count] as const;
    })
  );
  const noteCountByContact = new Map(noteCounts);

  const contacts: GhlContact[] = base.contacts.map((c) => ({
    ...c,
    noteCount: noteCountByContact.get(c.id) ?? 0,
  }));

  const loadedSoFar = (page - 1) * pageLimit + contacts.length;
  const hasMore = contacts.length === pageLimit && loadedSoFar < base.total;

  return {
    contacts,
    page,
    pageLimit,
    total: base.total,
    hasMore,
  };
}

// ── Notes ────────────────────────────────────────────────────────────

export async function getContactNotes(contactId: string): Promise<GhlContactNote[]> {
  return cachedSingleflight(`ghl:notes:${contactId}`, TTL_DETAIL, async () => {
    const raw = await ghlRequest<{ notes?: unknown[] }>(
      `/contacts/${encodeURIComponent(contactId)}/notes`
    );
    return (raw.notes ?? []).map((n) => normNote(n as Record<string, unknown>));
  });
}

/**
 * Look up a single GHL contact by id. Cached per-id; safe to call from any
 * code path that needs full contact details (cross-reference, deep-links).
 */
export async function getContactById(contactId: string): Promise<GhlContact | null> {
  return cachedSingleflight(`ghl:contact-by-id:${contactId}`, TTL_DETAIL, async () => {
    const raw = await ghlRequest<{ contact?: unknown }>(
      `/contacts/${encodeURIComponent(contactId)}`
    );
    if (!raw.contact) return null;
    return normContact(raw.contact as Record<string, unknown>);
  });
}

/**
 * Create a note on a contact. Busts the per-contact notes cache on success
 * so subsequent reads (notes list, page-level noteCount) reflect the write.
 */
export async function createContactNote(
  contactId: string,
  body: string
): Promise<GhlContactNote> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Note body is required");

  const raw = await ghlRequest<{ note?: unknown }>(
    `/contacts/${encodeURIComponent(contactId)}/notes`,
    {
      method: "POST",
      body: { body: trimmed },
    }
  );
  cache.delete(`ghl:notes:${contactId}`);
  if (!raw.note) {
    // Some GHL versions return the created entity unwrapped at the root.
    if (raw && typeof raw === "object" && "id" in raw) {
      return normNote(raw as unknown as Record<string, unknown>);
    }
    throw new Error("GHL did not return the created note");
  }
  return normNote(raw.note as Record<string, unknown>);
}

// ── Appointments ─────────────────────────────────────────────────────

export async function getContactAppointments(contactId: string) {
  return cachedSingleflight(`ghl:appts:${contactId}`, TTL_DETAIL, async () => {
    const raw = await ghlRequest<{ events?: unknown[]; appointments?: unknown[] }>(
      `/contacts/${encodeURIComponent(contactId)}/appointments`
    );
    // GHL has shipped this endpoint with both `events` and `appointments`
    // keys across API versions — accept either to avoid silent empty lists.
    const list = raw.events ?? raw.appointments ?? [];
    return list.map((a) => normAppointment(a as Record<string, unknown>));
  });
}
