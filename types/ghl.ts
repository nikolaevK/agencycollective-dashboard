// Lightweight types for the GHL Contacts read surface. Fields are a strict
// subset of GHL's actual response — we keep only what the UI consumes so
// schema drift on unused fields doesn't break us.

export interface GhlContact {
  id: string;
  locationId: string;
  firstName?: string | null;
  lastName?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  additionalEmails: string[];
  additionalPhones: string[];
  companyName?: string | null;
  source?: string | null;
  type?: string | null;
  tags: string[];
  dateAdded?: string | null;
  dateUpdated?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  timezone?: string | null;
  /** GHL user id of the team member this contact is assigned to. */
  assignedTo?: string | null;
  /** Do-not-disturb flag on the contact in GHL. */
  dnd?: boolean | null;

  // Populated by the enriched list batch endpoint; absent on per-contact GET.
  noteCount?: number;
  appointmentCount?: number;
  nextAppointmentTime?: string | null;     // first start time strictly in the future, ISO
  lastAppointmentTime?: string | null;     // most recent past start time, ISO
  appointmentStatuses?: string[];          // distinct statuses across all appointments
  /** Opportunities tied to this contact, resolved from the bulk pipelines+opportunities fetch. */
  opportunities?: GhlOpportunity[];
  /** Workflow ids the contact is currently enrolled in. */
  workflowIds?: string[];
  /** Conversation summary derived from the bulk conversations fetch. */
  conversation?: GhlConversationSummary;
}

export interface GhlContactNote {
  id: string;
  body: string;
  userId?: string | null;
  contactId: string;
  dateAdded: string;
}

export interface GhlContactAppointment {
  id: string;
  title?: string | null;
  contactId: string;
  calendarId?: string | null;
  locationId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  appointmentStatus?: string | null;
  assignedUserId?: string | null;
  notes?: string | null;
  address?: string | null;
  meetingLocationType?: string | null;
  /** ID of the synced Google Calendar event, when GHL exposes it. Used to
   *  cross-reference Google calendar cards back to a GHL contact. */
  googleEventId?: string | null;
}

export interface GhlContactBatch {
  contacts: GhlContact[];
  page: number;
  pageLimit: number;
  total: number;
  hasMore: boolean;
}

export interface GhlUser {
  id: string;
  name: string | null;
  email: string | null;
}

export interface GhlTag {
  id: string;
  name: string;
}

// ── Opportunities / Pipelines ────────────────────────────────────────

export interface GhlPipelineStage {
  id: string;
  name: string;
  position?: number;
}

export interface GhlPipeline {
  id: string;
  name: string;
  stages: GhlPipelineStage[];
}

export interface GhlOpportunity {
  id: string;
  name: string | null;
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  /** open | won | lost | abandoned (per GHL) */
  status: string | null;
  monetaryValue: number | null;
  source: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// ── Workflows ────────────────────────────────────────────────────────

export interface GhlWorkflow {
  id: string;
  name: string;
  status?: string | null;
}

// ── Conversations ────────────────────────────────────────────────────

export interface GhlConversationSummary {
  threadCount: number;
  /** True when at least one thread has lastMessageType=inbound or unreadCount>0 — i.e. the contact has replied at least once. */
  repliedAtLeastOnce: boolean;
  /** Most recent message timestamp across all threads, regardless of direction. ISO. */
  lastMessageAt: string | null;
  /** Unread message count summed across threads (proxy for incoming engagement). */
  unreadCount: number;
}

export interface GhlConversation {
  id: string;
  contactId: string;
  /** GHL conversation type (TYPE_PHONE, TYPE_EMAIL, etc). */
  type: string | null;
  unreadCount: number;
  lastMessageType: string | null;
  lastMessageDate: string | null;
  lastMessageBody: string | null;
  /** "inbound" / "outbound" — derived from GHL's lastMessageDirection if present. */
  lastMessageDirection: string | null;
}

/**
 * Lightweight contact summary returned by the cross-reference endpoint.
 * Trimmed to what calendar cards need so the response stays small.
 *
 * Strict Google-event-id matching only — no email fallback. Email-based
 * lookups produced false positives in production (a generic attendee email
 * mapping to the wrong contact), so cards now stay invisible unless the
 * GHL appointment exposes a `googleEventId` matching the calendar event.
 */
export interface GhlContactRef {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  source: string | null;
}

export interface GhlMessage {
  id: string;
  conversationId: string;
  /** GHL message type (TYPE_SMS, TYPE_EMAIL, TYPE_CALL, TYPE_VOICEMAIL, TYPE_FB, TYPE_IG, TYPE_WEBCHAT, TYPE_GMB, TYPE_ACTIVITY_*). */
  type: string;
  direction: "inbound" | "outbound";
  dateAdded: string;
  body: string | null;
  status: string | null;
  attachments: string[];
  /** GHL user id of the sender (outbound) when present. */
  userId: string | null;
}
