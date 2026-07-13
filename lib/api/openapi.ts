import type { ScopeKey } from "@/lib/apiScopes";

/**
 * Hand-authored OpenAPI 3.1 spec for the external API — the single source of
 * truth consumed by the docs page (/dashboard/api-docs), the MCP tool
 * generator (lib/api/mcpTools.ts), and GET /api/v1/openapi.json. Routes are
 * thin adapters, so the spec is authored (not generated) and kept in lockstep
 * by the dev-time drift guard (lib/api/driftCheck.ts).
 *
 * Conventions: all money fields are integer CENTS; commission rates are
 * basis points; lists take ?limit (≤200) & ?offset and return
 * meta.pagination; every operation carries its required scope in `x-scope`.
 */

export interface OpenApiSchema {
  type?: string;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  required?: string[];
  enum?: string[];
  description?: string;
  nullable?: boolean;
  additionalProperties?: boolean | OpenApiSchema;
}

export interface OpenApiParameter {
  name: string;
  in: "query" | "path";
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  "x-scope": ScopeKey;
  /** Response is a binary stream (PDF/image) — skipped by the MCP generator. */
  "x-binary"?: boolean;
  /** Request is multipart/form-data (file upload) — skipped by MCP. */
  "x-multipart"?: boolean;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    description?: string;
    schema: OpenApiSchema;
  };
}

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface OpenApiSpec {
  openapi: "3.1.0";
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, Partial<Record<HttpMethod, OpenApiOperation>>>;
  securitySchemes: Record<string, unknown>;
}

/* ── Shorthand builders ─────────────────────────────────────────────── */

const obj = (
  properties: Record<string, OpenApiSchema>,
  required?: string[]
): OpenApiSchema => ({ type: "object", properties, ...(required ? { required } : {}) });
const str = (description?: string): OpenApiSchema => ({ type: "string", ...(description ? { description } : {}) });
const num = (description?: string): OpenApiSchema => ({ type: "integer", ...(description ? { description } : {}) });
const bool = (description?: string): OpenApiSchema => ({ type: "boolean", ...(description ? { description } : {}) });
const anyObj = (description?: string): OpenApiSchema => ({
  type: "object",
  additionalProperties: true,
  ...(description ? { description } : {}),
});
const arr = (items: OpenApiSchema): OpenApiSchema => ({ type: "array", items });

const pathParam = (name: string, description: string): OpenApiParameter => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string" },
});
const q = (name: string, description: string, schema: OpenApiSchema = { type: "string" }): OpenApiParameter => ({
  name,
  in: "query",
  description,
  schema,
});

const PAGINATION: OpenApiParameter[] = [
  q("limit", "Page size, 1–200 (default 50)", { type: "integer" }),
  q("offset", "Items to skip (default 0)", { type: "integer" }),
];
const WINDOW: OpenApiParameter[] = [
  q("since", "Window start (yyyy-mm-dd)"),
  q("until", "Window end (yyyy-mm-dd)"),
];
const MONTH_YEAR: OpenApiParameter[] = [
  q("month", "Month 1–12 (default: current)", { type: "integer" }),
  q("year", "Year 2000–2100 (default: current)", { type: "integer" }),
];
/** Every binary download also serves a machine-friendly base64 JSON form. */
const BASE64_DOWNLOAD: OpenApiParameter[] = [
  q(
    "format",
    'Set to "base64" to receive JSON { fileName, contentType, size, dataBase64 } instead of raw bytes',
    { type: "string", enum: ["base64"] }
  ),
  q(
    "maxBytes",
    "With format=base64: fail with 413 (metadata included) instead of returning a file larger than this many bytes",
    { type: "integer" }
  ),
];
/** JSON-upload fields accepted by every multipart operation. */
const fileBase64 = (accept: string): OpenApiSchema =>
  str(`Base64-encoded file content — the JSON alternative to the multipart \`file\` field. ${accept}`);

function op(
  operationId: string,
  summary: string,
  tag: string,
  scope: ScopeKey,
  extra?: Partial<OpenApiOperation>
): OpenApiOperation {
  return { operationId, summary, tags: [tag], "x-scope": scope, ...extra };
}

/* ── Reusable body schemas ──────────────────────────────────────────── */

/** Meta account writable fields. Credential fields are write-only (redacted from every read). */
const metaAccountBody = (required?: string[]): OpenApiSchema =>
  obj(
    {
      fbEmail: str("Account email — required on create, non-empty on update"),
      fbPassword: str("WRITE-ONLY credential — never returned"),
      twofaSecret: str("WRITE-ONLY credential — never returned"),
      twofaLink: str("WRITE-ONLY credential (2FA code generator link) — never returned"),
      mailPassword: str("WRITE-ONLY credential — never returned"),
      recoveryEmail: str("WRITE-ONLY credential — never returned"),
      profileLink: str("FB profile URL"),
      bmId: str("Business Manager id"),
      loginOk: bool("Setup checklist: login verified"),
      pageMade: bool("Setup checklist: page created"),
      adAccountMade: bool("Setup checklist: ad account created"),
      bmMade: bool("Setup checklist: Business Manager created"),
      cardAdded: bool("Setup checklist: card added"),
      stage: str("Stage slug from /meta-accounts/options?kind=stage"),
      status: str("Status slug from /meta-accounts/options?kind=status"),
      assignee: str("Who has access"),
      clientId: str("Linked client id"),
      batch: str("Source batch label"),
      notes: str(),
    },
    required
  );

/** Team task writable fields. Assignee is ONE individual admin. */
const teamTaskBody = (required?: string[]): OpenApiSchema =>
  obj(
    {
      adminId: str("Assignee admin id (one individual — required on create, immutable after)"),
      title: str("Required on create"),
      description: str(),
      clientId: str("Optional tagged client id (null to clear)"),
      status: {
        type: "string",
        enum: ["todo", "in_progress", "review", "complete"],
      },
      priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
      dueDate: str("yyyy-mm-dd (business calendar; null to clear)"),
      lineup: bool("Pinned to the member's Lineup"),
      checklist: arr(
        obj({ id: str("Stable item id (optional)"), text: str(), done: bool() }, ["text"])
      ),
    },
    required
  );

/** Team action item writable fields (create). */
const teamActionItemBody = (required?: string[]): OpenApiSchema =>
  obj(
    {
      adminId: str("Routed member admin id (one individual)"),
      body: str("The report text — also becomes the linked task's description"),
      clientId: str("Optional tagged client id"),
      sourceType: { type: "string", enum: ["slack", "dashboard", "system"] },
      sourceChannel: str("Source label, e.g. '#felix-chem' or 'Client notes'"),
      authorLabel: str("Who raised it, e.g. 'Chris' or 'Rebill bot'"),
      externalTs: str("Original timestamp in the source system (ISO 8601)"),
      taskTitle: str("Override for the auto-created task title (default: body head)"),
      dueDate: str("Linked task due date (yyyy-mm-dd)"),
      priority: {
        type: "string",
        enum: ["urgent", "high", "normal", "low"],
        description: "Linked task priority (default normal)",
      },
    },
    required
  );

const closerBody = obj(
  {
    displayName: str(),
    email: str(),
    role: {
      type: "string",
      enum: ["senior_closer", "account_executive", "inbound_specialist", "closer", "setter"],
    },
    commissionRateBps: num("Commission in basis points (1250 = 12.5%)"),
    quotaCents: num("Monthly quota in cents"),
    status: { type: "string", enum: ["active", "inactive"] },
  },
  ["displayName", "email"]
);

const dealBody = obj(
  {
    closerId: str(),
    clientName: str(),
    dealValue: num("Deal value in integer CENTS"),
    status: {
      type: "string",
      enum: ["closed", "not_closed", "pending_signature", "rescheduled", "follow_up"],
    },
    clientEmail: str(),
    serviceCategory: str(),
    industry: str(),
    closingDate: str("yyyy-mm-dd"),
    notes: str(),
    paymentType: str("local | international"),
    brandName: str(),
    website: str(),
    paidStatus: { type: "string", enum: ["paid", "unpaid"] },
    showStatus: { type: "string", enum: ["showed", "no_show"], nullable: true },
    additionalCcEmails: arr(str()),
    setterId: str(),
    setterTier: { type: "string", enum: ["A", "B", "C", "D"], nullable: true },
    noRetainer: bool(),
    googleEventId: str(),
  },
  ["closerId", "clientName"]
);

const payoutBody = obj({
  brandName: str(),
  payoutMonth: num("1–12 (default: current)"),
  payoutYear: num(),
  amountDue: num("Integer CENTS"),
  amountPaid: num("Integer CENTS"),
  dateJoined: str(),
  firstDayAdSpend: str(),
  vertical: str(),
  pointOfContact: str(),
  service: str(),
  isSigned: bool(),
  isPaid: bool(),
  addedToSlack: bool(),
  paymentNotes: str(),
  salesRep: str('Reconciliation markers: contains "rebill" or "ad account"'),
  payDistributed: { type: "string", enum: ["Yes", "No", "Hold Til Full Pay"] },
  payDistributedDate: str(),
  commissionSplit: bool(),
  splitDetails: arr(obj({ name: str(), pct: num() })),
  referral: str(),
  referralPct: num("0–100"),
});

const clientBody = obj(
  {
    displayName: str(),
    email: str(),
    status: { type: "string", enum: ["active", "onboarding", "inactive", "archived"] },
    mrrCents: num("Integer CENTS"),
    category: str(),
    accountId: str("Meta ad account id (act_… or numeric)"),
    joinedAt: str("yyyy-mm-dd"),
    payoutBrand: str(),
    analystEnabled: bool(),
    designBoardEnabled: bool(),
  },
  ["displayName", "email"]
);

const billingBody = obj({
  cadence: str(),
  billingDay: num("1–31 or null"),
  paused: bool(),
  pauseReason: str("≤500 chars"),
  extendUntil: str("yyyy-mm-dd or null"),
  lastRebilledOverride: str("yyyy-mm-dd or null — authoritative last-billed"),
  mrrMonthOverride: str("yyyy-mm or null — pins MRR to a month"),
  leadDays: num(),
  settingsNotes: str("≤5000 chars"),
});

const adAccountBody = obj(
  {
    accountName: str(),
    userId: str("Client id, or null to unattach"),
    vendor: str(),
    platform: str(),
    adSpendFeeBps: num("200–700 in 50-bps steps"),
    monthlyRetainerCents: num("Integer CENTS"),
    status: { type: "string", enum: ["active", "inactive"] },
    notes: str(),
    billingPaused: bool(),
    billingDay: num("1–31 or null"),
    leadDays: num(),
    extendUntil: str("yyyy-mm-dd or null"),
    lastBilledOverride: str("yyyy-mm-dd or null"),
  },
  ["accountName"]
);

const registerInvoiceBody = obj(
  {
    invoiceNumber: str(),
    cycleAnchor: str("yyyy-mm-dd — the schedule cycle this invoice covers"),
    amountCents: num("Integer CENTS"),
    sentAt: str("yyyy-mm-dd or ISO timestamp"),
    recipientEmail: str(),
    payoutDocumentId: str(),
  },
  ["invoiceNumber", "cycleAnchor", "amountCents"]
);

/* ── The spec ───────────────────────────────────────────────────────── */

export const openApiSpec: OpenApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Agency Collective External API",
    version: "1.0.0",
    description:
      "Token-authenticated REST API mirroring the admin dashboard's Closers, " +
      "Client Directory, Media Buyers, and SOPs surfaces. First-party data " +
      "CRUD only — no emails, DocuSeal sends, GHL syncs, or calendar proxying. " +
      "All money fields are integer cents. Authenticate with " +
      "`Authorization: Bearer ac_live_…`.",
  },
  servers: [{ url: "/api/v1", description: "This deployment" }],
  tags: [
    { name: "closer", description: "Closers page: closers, deals, payouts, attendance" },
    { name: "client", description: "Client Directory: clients, billing, ad accounts, welcome kit" },
    { name: "media", description: "Media Buyers: documents, folders, reads, activity" },
    { name: "sops", description: "SOPs: documents, folders, deterministic import" },
    { name: "audit", description: "Audit Log: read-only trail of admin + API actions" },
    {
      name: "metaaccounts",
      description:
        "Meta Accounts: aged FB account inventory & warm-up. Credential fields are write-only — accepted on create/update/import, never returned.",
    },
    {
      name: "team",
      description:
        "Team hub: roster member rollups (clients, MRR managed vs goal, rebills, task stats), per-member tasks, and action items. Creating an action item auto-creates its linked task; solving one side syncs the other.",
    },
  ],
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      description: "API token minted at /dashboard/api-tokens (ac_live_…).",
    },
  },
  paths: {
    /* ── Closer surface ─────────────────────────────────────────────── */
    "/closer/overview/stats": {
      get: op("getTeamStats", "Team deal stats", "closer", "closer:read", {
        description: "Lifetime + windowed buckets, per-closer leaderboard, close rate.",
        parameters: WINDOW,
      }),
    },
    "/closer/overview/trend": {
      get: op("getTeamTrend", "Monthly revenue trend", "closer", "closer:read", {
        parameters: [q("months", "1–36 (default 12)", { type: "integer" })],
      }),
    },
    "/closer/closers": {
      get: op("listClosers", "List closers & setters", "closer", "closer:read", {
        parameters: [...PAGINATION, q("status", "active | inactive"), q("role", "Filter by role")],
      }),
      post: op("createCloser", "Create a closer/setter", "closer", "closer:write", {
        requestBody: { required: true, schema: closerBody },
      }),
    },
    "/closer/closers/{id}": {
      get: op("getCloser", "Get a closer", "closer", "closer:read", {
        parameters: [pathParam("id", "Closer id")],
      }),
      patch: op("updateCloser", "Update a closer", "closer", "closer:write", {
        parameters: [pathParam("id", "Closer id")],
        requestBody: { schema: closerBody },
      }),
      delete: op("deleteCloser", "Delete a closer", "closer", "closer:delete", {
        description: "Cascades: setter appointments, deal setter refs, notes, shares.",
        parameters: [pathParam("id", "Closer id")],
      }),
    },
    "/closer/closers/{id}/stats": {
      get: op("getCloserStats", "Per-closer stats + chart deals", "closer", "closer:read", {
        parameters: [pathParam("id", "Closer id"), ...WINDOW],
      }),
    },
    "/closer/deals": {
      get: op("listDeals", "List deals", "closer", "closer:read", {
        description: "Includes invoice/contract status badges per deal.",
        parameters: [
          ...PAGINATION,
          ...WINDOW,
          q("status", "Deal status filter"),
          q("closerId", "Filter to one closer"),
        ],
      }),
      post: op("createDeal", "Create a deal", "closer", "closer:write", {
        requestBody: { required: true, schema: dealBody },
      }),
    },
    "/closer/deals/{id}": {
      get: op("getDeal", "Get a deal", "closer", "closer:read", {
        parameters: [pathParam("id", "Deal id")],
      }),
      patch: op("updateDeal", "Update a deal", "closer", "closer:write", {
        description:
          "First-party effects only: auto-show attendance on closed transition, invoice email sync. No GHL pushes.",
        parameters: [pathParam("id", "Deal id")],
        requestBody: { schema: dealBody },
      }),
      delete: op("deleteDeal", "Delete a deal", "closer", "closer:delete", {
        parameters: [pathParam("id", "Deal id")],
      }),
    },
    "/closer/deals/{id}/invoices": {
      get: op("getDealInvoices", "Deal invoice records", "closer", "closer:read", {
        description: "Primary + additional invoice records. No email sending in v1.",
        parameters: [pathParam("id", "Deal id")],
      }),
    },
    "/closer/deals/{id}/invoices/additional": {
      post: op("createAdditionalInvoice", "Create an additional invoice draft", "closer", "closer:write", {
        parameters: [pathParam("id", "Deal id")],
        requestBody: {
          required: true,
          schema: obj({ invoiceData: anyObj("InvoiceData object") }, ["invoiceData"]),
        },
      }),
      delete: op("deleteAdditionalInvoice", "Delete an additional invoice", "closer", "closer:delete", {
        parameters: [pathParam("id", "Deal id"), { ...q("invoiceId", "Additional invoice id"), required: true }],
      }),
    },
    "/closer/deals/{id}/contracts": {
      get: op("getDealContracts", "Deal contract records + statuses", "closer", "closer:read", {
        description: "Read-only; DocuSeal send/sync is excluded from v1.",
        parameters: [pathParam("id", "Deal id")],
      }),
    },
    "/closer/deal-invoices/{id}": {
      get: op("getDealInvoice", "Get an invoice record", "closer", "closer:read", {
        parameters: [pathParam("id", "Invoice id (primary or additional)")],
      }),
      patch: op("updateDealInvoice", "Update an invoice record", "closer", "closer:write", {
        parameters: [pathParam("id", "Invoice id")],
        requestBody: {
          required: true,
          schema: obj({
            invoiceData: anyObj("InvoiceData object"),
            status: { type: "string", enum: ["draft", "sent"] },
          }),
        },
      }),
    },
    "/closer/deal-invoices/{id}/pdf": {
      get: op("getDealInvoicePdf", "Download the stored invoice PDF", "closer", "closer:read", {
        "x-binary": true,
        parameters: [pathParam("id", "Invoice id"), ...BASE64_DOWNLOAD],
      }),
    },
    "/closer/contract-templates": {
      get: op("listContractTemplates", "List contract templates", "closer", "closer:read"),
      post: op("createContractTemplate", "Create a template mapping", "closer", "closer:write", {
        requestBody: {
          required: true,
          schema: obj(
            {
              name: str(),
              docusealTemplateId: num(),
              serviceKeys: arr(str()),
              isDefault: bool(),
            },
            ["name", "docusealTemplateId"]
          ),
        },
      }),
    },
    "/closer/contract-templates/{id}": {
      patch: op("updateContractTemplate", "Update a template mapping", "closer", "closer:write", {
        parameters: [pathParam("id", "Template id")],
        requestBody: {
          schema: obj({
            name: str(),
            docusealTemplateId: num(),
            serviceKeys: arr(str()),
            isDefault: bool(),
          }),
        },
      }),
      delete: op("deleteContractTemplate", "Delete a template mapping", "closer", "closer:delete", {
        parameters: [pathParam("id", "Template id")],
      }),
    },
    "/closer/payouts": {
      get: op("listPayouts", "List payouts for a month", "closer", "closer:read", {
        parameters: [...MONTH_YEAR, ...PAGINATION],
      }),
      post: op("createPayout", "Create a payout", "closer", "closer:write", {
        requestBody: { required: true, schema: payoutBody },
      }),
    },
    "/closer/payouts/{id}": {
      get: op("getPayout", "Get a payout", "closer", "closer:read", {
        parameters: [pathParam("id", "Payout id")],
      }),
      patch: op("updatePayout", "Update a payout", "closer", "closer:write", {
        parameters: [pathParam("id", "Payout id")],
        requestBody: { schema: payoutBody },
      }),
      delete: op("deletePayout", "Delete a payout", "closer", "closer:delete", {
        parameters: [pathParam("id", "Payout id")],
      }),
    },
    "/closer/payouts/summary": {
      get: op("getPayoutSummary", "Month payout summary", "closer", "closer:read", {
        parameters: MONTH_YEAR,
      }),
    },
    "/closer/payouts/rebill-metrics": {
      get: op("getRebillMetrics", "Month rebill metrics", "closer", "closer:read", {
        parameters: MONTH_YEAR,
      }),
    },
    "/closer/payouts/importable-deals": {
      get: op("listImportableDeals", "Closed deals eligible for payout import", "closer", "closer:read"),
    },
    "/closer/payouts/import-from-deal": {
      post: op("importPayoutFromDeal", "Create a payout from a closed deal", "closer", "closer:write", {
        description:
          "One payout per deal (409 on duplicate). Attaches signed scopes + invoice PDFs; failures land in meta.warnings.",
        requestBody: {
          required: true,
          schema: obj(
            { dealId: str("UUID of a closed deal"), ...payoutBody.properties },
            ["dealId", "brandName"]
          ),
        },
      }),
    },
    "/closer/payouts/sales-reps": {
      get: op("listSalesReps", "Sales-rep options", "closer", "closer:read"),
      post: op("addSalesRep", "Add a sales-rep option", "closer", "closer:write", {
        requestBody: { required: true, schema: obj({ name: str() }, ["name"]) },
      }),
      delete: op("removeSalesRep", "Remove a sales-rep option", "closer", "closer:delete", {
        parameters: [{ ...q("name", "Option to remove"), required: true }],
      }),
    },
    "/closer/payouts/verticals": {
      get: op("listVerticals", "Vertical options", "closer", "closer:read"),
      post: op("addVertical", "Add a vertical option", "closer", "closer:write", {
        requestBody: { required: true, schema: obj({ name: str() }, ["name"]) },
      }),
      delete: op("removeVertical", "Remove a vertical option", "closer", "closer:delete", {
        parameters: [{ ...q("name", "Option to remove"), required: true }],
      }),
    },
    "/closer/payouts/referrals": {
      get: op("listReferrals", "Referral options", "closer", "closer:read"),
      post: op("addReferral", "Add a referral option", "closer", "closer:write", {
        requestBody: { required: true, schema: obj({ name: str() }, ["name"]) },
      }),
      delete: op("removeReferral", "Remove a referral option", "closer", "closer:delete", {
        parameters: [{ ...q("name", "Option to remove"), required: true }],
      }),
    },
    "/closer/payouts/documents": {
      get: op("listBrandDocuments", "Brand documents (fuzzy match)", "closer", "closer:read", {
        parameters: [{ ...q("brand", "Brand name"), required: true }],
      }),
      post: op("uploadBrandDocument", "Upload a brand document (PDF ≤10 MB)", "closer", "closer:write", {
        "x-multipart": true,
        description:
          "multipart/form-data (file, brandName, docType, payoutMonth?, payoutYear?) or application/json with fileBase64.",
        requestBody: {
          required: true,
          schema: obj(
            {
              fileBase64: fileBase64("PDF only, ≤10 MB."),
              fileName: str("File name, e.g. scope.pdf"),
              brandName: str("Brand the document belongs to (fuzzy-matched)"),
              docType: { type: "string", enum: ["project_scope", "invoice"] },
              payoutMonth: num("1–12"),
              payoutYear: num("2000–2100"),
            },
            ["fileBase64", "brandName", "docType"]
          ),
        },
      }),
    },
    "/closer/payouts/documents/{id}": {
      get: op("downloadBrandDocument", "Download a brand document", "closer", "closer:read", {
        "x-binary": true,
        parameters: [pathParam("id", "Document id"), q("view", "1 = render inline"), ...BASE64_DOWNLOAD],
      }),
      delete: op("deleteBrandDocument", "Delete a brand document", "closer", "closer:delete", {
        parameters: [pathParam("id", "Document id")],
      }),
    },
    "/closer/attendance": {
      get: op("listAttendance", "Latest attendance mark per event", "closer", "closer:read", {
        parameters: PAGINATION,
      }),
    },
    "/closer/attendance/show-rate": {
      get: op("getShowRate", "Team show rate + per-closer breakdown", "closer", "closer:read", {
        parameters: WINDOW,
      }),
    },
    "/closer/appointments": {
      get: op("getAppointmentsIndex", "Appointment index by event", "closer", "closer:read"),
      post: op("upsertAppointment", "Create/update a setter claim", "closer", "closer:write", {
        description: "Upsert on (setterId, googleEventId). GHL sync excluded from v1.",
        requestBody: {
          required: true,
          schema: obj(
            {
              setterId: str(),
              googleEventId: str(),
              clientName: str(),
              clientEmail: str(),
              scheduledAt: str(),
              preCallStatus: str(),
              postCallStatus: str(),
              notes: str(),
              setterTier: { type: "string", enum: ["A", "B", "C", "D"], nullable: true },
            },
            ["setterId", "googleEventId"]
          ),
        },
      }),
    },
    "/closer/appointments/{id}": {
      get: op("getAppointment", "Get an appointment", "closer", "closer:read", {
        parameters: [pathParam("id", "Appointment id")],
      }),
      delete: op("deleteAppointment", "Delete an appointment", "closer", "closer:delete", {
        parameters: [pathParam("id", "Appointment id")],
      }),
    },

    /* ── Client surface ─────────────────────────────────────────────── */
    "/client/clients": {
      get: op("listClients", "Client Directory rows", "client", "client:read", {
        description:
          "Full directory rows: payout cross-reference, billing schedule, roster profile, team.",
        parameters: [...PAGINATION, q("status", "Status filter"), q("search", "Name/email/brand search")],
      }),
      post: op("createClient", "Create a client", "client", "client:write", {
        requestBody: { required: true, schema: clientBody },
      }),
    },
    "/client/clients/from-payout": {
      post: op("createClientFromPayout", "Create a client from a payout brand", "client", "client:write", {
        requestBody: {
          required: true,
          schema: obj(
            {
              brandName: str(),
              dateJoined: str("yyyy-mm-dd"),
              monthlyMrrCents: num("Integer CENTS"),
              category: str(),
              email: str(),
            },
            ["brandName"]
          ),
        },
      }),
    },
    "/client/clients/payout-pool": {
      get: op("getPayoutPool", "Payout brands with no matching client", "client", "client:read", {
        parameters: WINDOW,
      }),
    },
    "/client/clients/{id}": {
      get: op("getClient", "Client detail + payment history", "client", "client:read", {
        parameters: [pathParam("id", "Client id")],
      }),
      patch: op("updateClient", "Update a client", "client", "client:write", {
        description: "Portal-critical fields (slug, password, design board URL) are not writable via v1.",
        parameters: [pathParam("id", "Client id")],
        requestBody: { schema: clientBody },
      }),
      delete: op("deleteClient", "Delete a client", "client", "client:delete", {
        description: "Cleans notes/billing/profile/team; unattaches ad accounts (never deletes them).",
        parameters: [pathParam("id", "Client id")],
      }),
    },
    "/client/clients/{id}/logo": {
      get: op("getClientLogo", "Download the client logo", "client", "client:read", {
        "x-binary": true,
        parameters: [pathParam("id", "Client id"), ...BASE64_DOWNLOAD],
      }),
      post: op("uploadClientLogo", "Upload a logo (png/jpg/webp ≤2 MB)", "client", "client:write", {
        "x-multipart": true,
        description: "multipart/form-data (file) or application/json with fileBase64 + contentType.",
        parameters: [pathParam("id", "Client id")],
        requestBody: {
          required: true,
          schema: obj(
            {
              fileBase64: fileBase64("png/jpg/webp, ≤2 MB."),
              contentType: {
                type: "string",
                enum: ["image/png", "image/jpeg", "image/webp"],
                description: "Image MIME type (required with fileBase64)",
              },
              fileName: str("Optional file name"),
            },
            ["fileBase64", "contentType"]
          ),
        },
      }),
      delete: op("clearClientLogo", "Remove the client logo", "client", "client:delete", {
        parameters: [pathParam("id", "Client id")],
      }),
    },
    "/client/clients/{id}/profile": {
      get: op("getClientProfile", "Roster profile", "client", "client:read", {
        parameters: [pathParam("id", "Client id")],
      }),
      patch: op("updateClientProfile", "Update the roster profile", "client", "client:write", {
        parameters: [pathParam("id", "Client id")],
        requestBody: {
          required: true,
          schema: obj({
            book: { type: "string", enum: ["agency", "pepads"] },
            website: str(),
            isTop: bool(),
            adsRunning: bool(),
            adPlatforms: arr(str()),
            stages: arr(str()),
            health: arr(str()),
            services: arr(str("meta|tiktok|google|creatives|email")),
            perfFee: str(),
            revThreshold: str(),
            manualBilling: arr(str()),
            manualNextRebill: str("yyyy-mm-dd"),
            manualMrrCents: num(),
            manualLtvCents: num(),
            rosterNotes: str(),
          }),
        },
      }),
    },
    "/client/clients/{id}/team": {
      get: op("getClientTeam", "Team assignments", "client", "client:read", {
        parameters: [pathParam("id", "Client id")],
      }),
      put: op("setClientTeam", "Replace one role's assignments", "client", "client:write", {
        parameters: [pathParam("id", "Client id")],
        requestBody: {
          required: true,
          schema: obj(
            {
              role: { type: "string", enum: ["media_buyer", "lead", "csm"] },
              adminIds: arr(str()),
            },
            ["role", "adminIds"]
          ),
        },
      }),
    },
    "/client/clients/{id}/accounts": {
      get: op("listClientAccounts", "Linked Meta ad accounts", "client", "client:read", {
        parameters: [pathParam("id", "Client id")],
      }),
      post: op("linkClientAccount", "Link a Meta ad account", "client", "client:write", {
        parameters: [pathParam("id", "Client id")],
        requestBody: {
          required: true,
          schema: obj({ accountId: str("act_… or numeric"), label: str() }, ["accountId"]),
        },
      }),
    },
    "/client/clients/{id}/accounts/{accountId}": {
      patch: op("updateClientAccount", "Toggle active / relabel a linked account", "client", "client:write", {
        parameters: [pathParam("id", "Client id"), pathParam("accountId", "Meta account id")],
        requestBody: {
          required: true,
          schema: obj({ isActive: bool(), label: str() }),
        },
      }),
      delete: op("unlinkClientAccount", "Unlink a Meta ad account", "client", "client:delete", {
        parameters: [pathParam("id", "Client id"), pathParam("accountId", "Meta account id")],
      }),
    },
    "/client/clients/{id}/billing": {
      get: op("getClientBilling", "Billing config + schedule + history", "client", "client:read", {
        parameters: [pathParam("id", "Client id")],
      }),
      patch: op("updateClientBilling", "Update billing controls", "client", "client:write", {
        parameters: [pathParam("id", "Client id")],
        requestBody: { required: true, schema: billingBody },
      }),
    },
    "/client/clients/{id}/billing/invoice/prefill": {
      get: op("prefillClientInvoice", "Prefilled re-bill invoice draft", "client", "client:read", {
        parameters: [pathParam("id", "Client id"), q("paymentType", "local | international")],
      }),
    },
    "/client/clients/{id}/billing/invoices/register": {
      post: op("registerClientInvoice", "Register an out-of-band re-bill invoice", "client", "client:write", {
        description: "No email — records the invoice into the re-bill lifecycle (invoice_sent).",
        parameters: [pathParam("id", "Client id")],
        requestBody: { required: true, schema: registerInvoiceBody },
      }),
    },
    "/client/clients/{id}/billing/invoices/{invoiceId}/mark-unpaid": {
      post: op("markClientInvoiceUnpaid", "Mark a sent invoice unpaid", "client", "client:write", {
        parameters: [pathParam("id", "Client id"), pathParam("invoiceId", "Invoice id")],
        requestBody: { schema: obj({ reason: str("≤500 chars") }) },
      }),
    },
    "/client/clients/{id}/documents": {
      get: op("listClientDocuments", "Client documents (invoices + scopes)", "client", "client:read", {
        description: "Read + download only; ad-hoc upload is excluded from v1.",
        parameters: [pathParam("id", "Client id")],
      }),
    },
    "/client/clients/{id}/documents/{docId}": {
      get: op("downloadClientDocument", "Download a client document", "client", "client:read", {
        "x-binary": true,
        parameters: [
          pathParam("id", "Client id"),
          pathParam("docId", "Document id"),
          q("view", "1 = inline"),
          ...BASE64_DOWNLOAD,
        ],
      }),
    },
    "/client/clients/{id}/notes": {
      get: op("listClientNotes", "Notes & reminders", "client", "client:read", {
        parameters: [pathParam("id", "Client id")],
      }),
      post: op("createClientNote", "Create a note/reminder", "client", "client:write", {
        parameters: [pathParam("id", "Client id")],
        requestBody: {
          required: true,
          schema: obj({ body: str("≤10k chars"), remindAt: str("ISO-like") }, ["body"]),
        },
      }),
    },
    "/client/clients/{id}/notes/{noteId}": {
      patch: op("updateClientNote", "Update a note", "client", "client:write", {
        parameters: [pathParam("id", "Client id"), pathParam("noteId", "Note id")],
        requestBody: {
          required: true,
          schema: obj({ body: str(), remindAt: str("ISO-like or null"), done: bool() }),
        },
      }),
      delete: op("deleteClientNote", "Delete a note", "client", "client:delete", {
        parameters: [pathParam("id", "Client id"), pathParam("noteId", "Note id")],
      }),
    },
    "/client/clients/{id}/ad-accounts": {
      get: op("listClientAdAccounts", "Ad accounts attached to a client", "client", "client:read", {
        parameters: [pathParam("id", "Client id")],
      }),
    },
    "/client/ad-accounts": {
      get: op("listAdAccounts", "Ad Accounts directory (rows + summary)", "client", "client:read"),
      post: op("createAdAccount", "Create an ad account", "client", "client:write", {
        requestBody: { required: true, schema: adAccountBody },
      }),
    },
    "/client/ad-accounts/{id}": {
      get: op("getAdAccount", "Get an ad account", "client", "client:read", {
        parameters: [pathParam("id", "Ad account id")],
      }),
      patch: op("updateAdAccount", "Update an ad account", "client", "client:write", {
        parameters: [pathParam("id", "Ad account id")],
        requestBody: { schema: adAccountBody },
      }),
      delete: op("deleteAdAccount", "Delete an ad account", "client", "client:delete", {
        parameters: [pathParam("id", "Ad account id")],
      }),
    },
    "/client/ad-accounts/{id}/invoices": {
      get: op("listAdAccountInvoices", "Invoice history for one account", "client", "client:read", {
        parameters: [pathParam("id", "Ad account id")],
      }),
    },
    "/client/ad-accounts/{id}/invoices/register": {
      post: op("registerAdAccountInvoice", "Register a historical ad-account invoice", "client", "client:write", {
        "x-multipart": true,
        description:
          "Non-superseding backfill, reconciled on insert. multipart/form-data (same fields; PDF under `pdf`) or application/json with fileBase64.",
        parameters: [pathParam("id", "Ad account id")],
        requestBody: {
          required: true,
          schema: obj(
            {
              invoiceNumber: str("Invoice number (≤100 chars)"),
              cycleAnchor: str("Billing cycle this invoice covers (yyyy-mm-dd)"),
              amountCents: num("Invoice total in integer CENTS"),
              sentAt: str("When it was sent (yyyy-mm-dd; default now)"),
              spendCents: num("Ad spend behind the fee line, in cents"),
              feeBps: num("Fee override in basis points (default: account fee)"),
              retainerCents: num("Retainer line in cents"),
              invoiceType: { type: "string", enum: ["retainer", "ad_spend", "combined"] },
              recipientEmail: str(),
              fileBase64: fileBase64("Optional invoice PDF, ≤10 MB."),
              fileName: str("PDF file name"),
            },
            ["invoiceNumber", "cycleAnchor", "amountCents"]
          ),
        },
      }),
    },
    "/client/ad-accounts/invoice/prefill": {
      get: op("prefillAdAccountInvoice", "Prefilled ad-account invoice draft", "client", "client:read", {
        parameters: [
          q("adAccountId", "Seed from this account (omit for a free invoice)"),
          q("spendCents", "Ad spend for the fee line", { type: "integer" }),
          q("feeBps", "Fee override (bps)", { type: "integer" }),
          q("retainerCents", "Retainer override", { type: "integer" }),
          q("accountName", "Account name override"),
          q("vendor", "Vendor override"),
          q("paymentType", "local | international"),
        ],
      }),
    },
    "/client/ad-accounts/invoices/{invoiceId}/document": {
      get: op("downloadAdAccountInvoicePdf", "Download the linked invoice PDF", "client", "client:read", {
        "x-binary": true,
        parameters: [pathParam("invoiceId", "Invoice id"), q("view", "1 = inline"), ...BASE64_DOWNLOAD],
      }),
    },
    "/client/ad-accounts/invoices/{invoiceId}/mark-unpaid": {
      post: op("markAdAccountInvoiceUnpaid", "Mark a sent ad-account invoice unpaid", "client", "client:write", {
        parameters: [pathParam("invoiceId", "Invoice id")],
        requestBody: { schema: obj({ reason: str("≤500 chars") }) },
      }),
    },
    "/client/ad-accounts/sent-invoices": {
      get: op("listAdAccountSentInvoices", "Ad-account invoices awaiting payment", "client", "client:read"),
    },
    "/client/ad-accounts/payment-settings": {
      get: op("getAdAccountPaymentSettings", "Ad-account payment templates", "client", "client:read"),
      put: op("setAdAccountPaymentSettings", "Save payment templates", "client", "client:write", {
        requestBody: {
          required: true,
          schema: obj({
            local: anyObj("PaymentInfo fields (bankName, accountNumber, …)"),
            international: anyObj("PaymentInfo fields"),
          }),
        },
      }),
      delete: op("resetAdAccountPaymentSettings", "Reset payment templates to defaults", "client", "client:delete", {
        parameters: [q("type", "local | international (omit = both)")],
      }),
    },
    "/client/welcome-kit": {
      get: op("getWelcomeKit", "Welcome Kit record", "client", "client:read"),
      put: op("saveWelcomeKit", "Save the Welcome Kit doc", "client", "client:write", {
        description: "Optimistic concurrency: stale baseUpdatedAt → 409 with current record.",
        requestBody: {
          required: true,
          schema: obj({ doc: anyObj("WelcomeKitDoc"), baseUpdatedAt: str() }, ["doc"]),
        },
      }),
      patch: op("toggleWelcomeKitShare", "Toggle public sharing", "client", "client:write", {
        requestBody: { required: true, schema: obj({ shareEnabled: bool() }, ["shareEnabled"]) },
      }),
    },
    "/client/welcome-kit/pdf": {
      get: op("downloadWelcomeKitPdf", "Download the kit PDF", "client", "client:read", {
        "x-binary": true,
        parameters: [...BASE64_DOWNLOAD],
      }),
      post: op("uploadWelcomeKitPdf", "Upload the kit PDF (≤10 MB)", "client", "client:write", {
        "x-multipart": true,
        description: "multipart/form-data (file) or application/json with fileBase64.",
        requestBody: {
          required: true,
          schema: obj(
            {
              fileBase64: fileBase64("PDF only, ≤10 MB."),
              fileName: str("File name, e.g. welcome-kit.pdf"),
            },
            ["fileBase64"]
          ),
        },
      }),
      delete: op("clearWelcomeKitPdf", "Remove the kit PDF", "client", "client:delete"),
    },
    "/client/ad-platform-options": {
      get: op("listAdPlatformOptions", "Custom Ad Platform chips", "client", "client:read"),
      post: op("addAdPlatformOption", "Add a chip", "client", "client:write", {
        requestBody: { required: true, schema: obj({ label: str() }, ["label"]) },
      }),
      patch: op("renameAdPlatformOption", "Rename a chip", "client", "client:write", {
        requestBody: { required: true, schema: obj({ value: str(), label: str() }, ["value", "label"]) },
      }),
      delete: op("removeAdPlatformOption", "Remove a chip", "client", "client:delete", {
        parameters: [{ ...q("value", "Chip value"), required: true }],
      }),
    },
    "/client/roster-options": {
      get: op("listRosterOptions", "Custom Stage/Health chips", "client", "client:read", {
        parameters: [{ ...q("kind", "stage | health"), required: true }],
      }),
      post: op("addRosterOption", "Add a chip", "client", "client:write", {
        requestBody: { required: true, schema: obj({ kind: str("stage | health"), label: str() }, ["kind", "label"]) },
      }),
      patch: op("renameRosterOption", "Rename a chip", "client", "client:write", {
        requestBody: {
          required: true,
          schema: obj({ kind: str(), value: str(), label: str() }, ["kind", "value", "label"]),
        },
      }),
      delete: op("removeRosterOption", "Remove a chip", "client", "client:delete", {
        parameters: [
          { ...q("kind", "stage | health"), required: true },
          { ...q("value", "Chip value"), required: true },
        ],
      }),
    },
    "/client/rebill-alerts": {
      get: op("getRebillAlerts", "Due/overdue re-bill alerts + reminders", "client", "client:read"),
    },
    "/client/sent-invoices": {
      get: op("listClientSentInvoices", "Re-bill invoices awaiting payment", "client", "client:read"),
    },
    "/client/team-options": {
      get: op("getTeamOptions", "Assignable admins", "client", "client:read"),
    },
    "/client/maintenance": {
      get: op("getMaintenance", "Portal maintenance banner config", "client", "client:read"),
      patch: op("setMaintenance", "Update the maintenance banner", "client", "client:write", {
        requestBody: {
          required: true,
          schema: obj({ enabled: bool(), message: str("≤500 chars") }, ["enabled"]),
        },
      }),
    },

    /* ── Media surface ──────────────────────────────────────────────── */
    "/media/documents": {
      get: op("listMediaDocuments", "List media documents", "media", "media:read", {
        parameters: [
          ...PAGINATION,
          q("folder", "Folder filter"),
          q("docType", "Document type filter"),
          q("platform", "meta | tiktok | google | cross"),
        ],
      }),
      post: op("uploadMediaDocument", "Upload a PDF (≤10 MB)", "media", "media:write", {
        "x-multipart": true,
        description:
          "multipart/form-data (file, folder?, docType?, platform?, tags?) or application/json with fileBase64.",
        requestBody: {
          required: true,
          schema: obj(
            {
              fileBase64: fileBase64("PDF only, ≤10 MB."),
              fileName: str("File name — must end in .pdf"),
              folder: str("Folder name (default general)"),
              docType: str("sop | report | guide | other"),
              platform: str("meta | tiktok | google | cross"),
              tags: arr(str()),
            },
            ["fileBase64", "fileName"]
          ),
        },
      }),
    },
    "/media/documents/{id}": {
      get: op("getMediaDocument", "Document metadata", "media", "media:read", {
        parameters: [pathParam("id", "Document id")],
      }),
      patch: op("updateMediaDocument", "Update document metadata", "media", "media:write", {
        parameters: [pathParam("id", "Document id")],
        requestBody: {
          required: true,
          schema: obj({
            fileName: str(),
            folder: str(),
            docType: str(),
            platform: str("meta | tiktok | google | cross | null"),
            tags: arr(str()),
          }),
        },
      }),
      delete: op("deleteMediaDocument", "Delete a document", "media", "media:delete", {
        description: "Manager-level in the app (media_manage) → requires media:delete.",
        parameters: [pathParam("id", "Document id")],
      }),
    },
    "/media/documents/{id}/file": {
      get: op("downloadMediaDocument", "Download the file bytes", "media", "media:read", {
        "x-binary": true,
        parameters: [pathParam("id", "Document id"), q("view", "1 = inline"), ...BASE64_DOWNLOAD],
      }),
    },
    "/media/documents/{id}/important": {
      patch: op("setMediaDocumentImportant", "Toggle the important flag", "media", "media:delete", {
        parameters: [pathParam("id", "Document id")],
        requestBody: { required: true, schema: obj({ important: bool() }, ["important"]) },
      }),
    },
    "/media/documents/{id}/acknowledge": {
      post: op("acknowledgeMediaDocument", "Mark as read by this token", "media", "media:write", {
        parameters: [pathParam("id", "Document id")],
      }),
      delete: op("unacknowledgeMediaDocument", "Remove this token's read receipt", "media", "media:write", {
        parameters: [pathParam("id", "Document id")],
      }),
    },
    "/media/documents/{id}/readers": {
      get: op("listMediaDocumentReaders", "Who has read this document", "media", "media:delete", {
        parameters: [pathParam("id", "Document id")],
      }),
    },
    "/media/folders": {
      get: op("listMediaFolders", "List folders", "media", "media:read"),
      post: op("createMediaFolder", "Create/recolor a folder", "media", "media:write", {
        requestBody: {
          required: true,
          schema: obj({ name: str(), color: str("gray|red|amber|green|teal|blue|violet|pink") }, ["name"]),
        },
      }),
    },
    "/media/folders/{name}": {
      patch: op("updateMediaFolder", "Rename and/or recolor a folder", "media", "media:write", {
        parameters: [pathParam("name", "Folder name (URL-encoded)")],
        requestBody: { required: true, schema: obj({ newName: str(), color: str() }) },
      }),
      delete: op("deleteMediaFolder", "Delete an empty folder (409 if not empty)", "media", "media:delete", {
        parameters: [pathParam("name", "Folder name (URL-encoded)")],
      }),
    },
    "/media/folders/{name}/important": {
      patch: op("setMediaFolderImportant", "Toggle folder importance", "media", "media:delete", {
        parameters: [pathParam("name", "Folder name (URL-encoded)")],
        requestBody: { required: true, schema: obj({ important: bool() }, ["important"]) },
      }),
    },
    "/media/activity": {
      get: op("getMediaActivity", "Media activity feed", "media", "media:read", {
        parameters: [q("limit", "1–200 (default 50)", { type: "integer" })],
      }),
    },

    /* ── SOPs surface ───────────────────────────────────────────────── */
    "/sops": {
      get: op("listSops", "List SOPs", "sops", "sops:read", {
        parameters: [...PAGINATION, q("folder", "Folder filter"), q("tag", "Tag filter")],
      }),
      post: op("createSop", "Create a SOP", "sops", "sops:write", {
        requestBody: {
          required: true,
          schema: obj(
            {
              doc: anyObj("SopDoc: { title, summary, sections[] }"),
              folder: str(),
              tags: arr(str()),
              status: { type: "string", enum: ["draft", "published"] },
            },
            ["doc"]
          ),
        },
      }),
    },
    "/sops/{id}": {
      get: op("getSop", "Get a SOP", "sops", "sops:read", {
        parameters: [pathParam("id", "SOP id")],
      }),
      patch: op("updateSop", "Update a SOP", "sops", "sops:write", {
        description: "Optimistic concurrency: stale baseUpdatedAt → 409 with the current record.",
        parameters: [pathParam("id", "SOP id")],
        requestBody: {
          required: true,
          schema: obj({
            doc: anyObj("SopDoc"),
            folder: str(),
            tags: arr(str()),
            status: { type: "string", enum: ["draft", "published"] },
            baseUpdatedAt: str("The updatedAt you last read"),
          }),
        },
      }),
      delete: op("deleteSop", "Delete a SOP", "sops", "sops:delete", {
        parameters: [pathParam("id", "SOP id")],
      }),
    },
    "/sops/folders": {
      get: op("listSopFolders", "List SOP folders", "sops", "sops:read"),
      post: op("createSopFolder", "Create/restyle a folder", "sops", "sops:write", {
        requestBody: {
          required: true,
          schema: obj({ name: str(), color: str(), icon: str() }, ["name"]),
        },
      }),
    },
    "/sops/folders/{name}": {
      patch: op("updateSopFolder", "Rename/restyle a folder", "sops", "sops:write", {
        parameters: [pathParam("name", "Folder name (URL-encoded)")],
        requestBody: { required: true, schema: obj({ newName: str(), color: str(), icon: str() }) },
      }),
      delete: op("deleteSopFolder", "Delete a folder (refuses General + non-empty)", "sops", "sops:delete", {
        parameters: [pathParam("name", "Folder name (URL-encoded)")],
      }),
    },
    "/audit-log": {
      get: op("listAuditLog", "Read the audit trail", "audit", "audit:read", {
        description:
          "Dashboard + API mutations, newest first. API actors appear as adminUsername \"api:<token name>\".",
        parameters: [
          q("action", 'Action prefix filter, e.g. "deal." or "client.logo"'),
          q("targetType", "Exact target type, e.g. deal, client, media_document"),
          q("targetId", "Exact target id"),
          q("adminId", "Actor id (admin id or API token id)"),
          ...WINDOW,
          ...PAGINATION,
        ],
      }),
    },
    "/sops/import": {
      post: op("importSop", "Deterministic SOP import (no AI)", "sops", "sops:write", {
        "x-multipart": true,
        description:
          "Extracts text and returns { doc, sourceName } for review — or the created record with create=true. multipart/form-data (file, folder?, create?) or application/json with fileBase64.",
        requestBody: {
          required: true,
          schema: obj(
            {
              fileBase64: fileBase64("pdf/docx/html/md/txt, ≤10 MB."),
              fileName: str("Original file name incl. extension — drives text extraction"),
              folder: str("Target SOP folder"),
              create: bool("true persists the imported doc immediately as a draft"),
            },
            ["fileBase64", "fileName"]
          ),
        },
      }),
    },

    /* ── Meta Accounts surface ──────────────────────────────────────── */
    "/meta-accounts": {
      get: op("listMetaAccounts", "List Meta accounts", "metaaccounts", "metaaccounts:read", {
        description:
          "FB account inventory, newest first. Credential fields (fbPassword, twofaSecret, twofaLink, mailPassword, recoveryEmail) are never returned.",
        parameters: [
          q("stage", "Exact stage slug (see /meta-accounts/options?kind=stage)"),
          q("status", "Exact status slug (see /meta-accounts/options?kind=status)"),
          q("batch", "Exact batch label"),
          q("clientId", "Linked client id"),
          ...PAGINATION,
        ],
      }),
      post: op("createMetaAccount", "Add a Meta account", "metaaccounts", "metaaccounts:write", {
        description: "Credential fields are write-only — stored but never returned by any read.",
        requestBody: { required: true, schema: metaAccountBody(["fbEmail"]) },
      }),
    },
    "/meta-accounts/{id}": {
      get: op("getMetaAccount", "One Meta account", "metaaccounts", "metaaccounts:read", {
        description: "Credential fields are never returned.",
        parameters: [pathParam("id", "Meta account id")],
      }),
      patch: op("updateMetaAccount", "Update a Meta account", "metaaccounts", "metaaccounts:write", {
        description:
          "Partial update — only provided fields change. Credential fields are write-only.",
        parameters: [pathParam("id", "Meta account id")],
        requestBody: { required: true, schema: metaAccountBody() },
      }),
      delete: op("deleteMetaAccount", "Delete a Meta account", "metaaccounts", "metaaccounts:delete", {
        parameters: [pathParam("id", "Meta account id")],
      }),
    },
    "/meta-accounts/import": {
      post: op("importMetaAccounts", "Bulk import from a spreadsheet", "metaaccounts", "metaaccounts:write", {
        "x-multipart": true,
        description:
          "xlsx/csv with a header row; columns matched by header name. De-dupes by fbEmail against existing rows and within the file. multipart/form-data (file, batch?) or application/json with fileBase64. Max 4 MB decoded — the platform rejects request bodies over ~4.5 MB, and base64 adds ~33%.",
        requestBody: {
          required: true,
          schema: obj(
            {
              fileBase64: fileBase64("xlsx or csv, ≤4 MB decoded."),
              fileName: str("Original file name — its base becomes the default batch label"),
              batch: str("Batch/provenance label for the imported rows"),
            },
            ["fileBase64"]
          ),
        },
      }),
    },
    "/meta-accounts/options": {
      get: op("listMetaAccountOptions", "Stage/Status chip vocabulary", "metaaccounts", "metaaccounts:read", {
        parameters: [
          q("kind", "stage or status", { type: "string", enum: ["stage", "status"] }),
        ],
      }),
      post: op("addMetaAccountOption", "Add a chip option", "metaaccounts", "metaaccounts:write", {
        requestBody: {
          required: true,
          schema: obj(
            {
              kind: { type: "string", enum: ["stage", "status"] },
              label: str("Display label (≤40 chars); the stored slug is derived once"),
              color: str("Palette token (e.g. slate, sky, teal, emerald, amber, red)"),
            },
            ["kind", "label"]
          ),
        },
      }),
      patch: op("updateMetaAccountOption", "Rename/recolor a chip option", "metaaccounts", "metaaccounts:write", {
        description: "The slug (value) never changes, so tagged accounts are untouched.",
        requestBody: {
          required: true,
          schema: obj(
            {
              kind: { type: "string", enum: ["stage", "status"] },
              value: str("Option slug"),
              label: str(),
              color: str(),
            },
            ["kind", "value"]
          ),
        },
      }),
      delete: op("removeMetaAccountOption", "Remove a chip option", "metaaccounts", "metaaccounts:delete", {
        description: "Accounts tagged with the slug keep it (renders as a plain chip).",
        parameters: [
          q("kind", "stage or status", { type: "string", enum: ["stage", "status"] }),
          q("value", "Option slug"),
        ],
      }),
    },

    /* ── Team hub surface ─────────────────────────────────────────────── */
    "/team/members": {
      get: op("listTeamMembers", "List Team roster members", "team", "team:read", {
        description:
          "Roster members with live rollups for the timeframe: client count, MRR managed (cents), monthly re-bill collection goal (`goalCents` — compared against collected, not MRR), health chip counts, rebill counts, current-month re-bill collection progress (`monthly.buckets` — collected/sent/due/overdue/scheduled/untracked, each {count, mrrCents}; collected = qualifying REBILL payout recorded in the month; `monthly.rebilledRevenueCents` = whole-book sum of the month's REBILL-flagged payout rows, non-null only for book-attribution members and totals), `retention` ({base, retained} — clients re-billed this month out of total clients managed), task stats, unsolved action items.",
        parameters: [
          q("timeframe", "Rollup window (default week)", {
            type: "string",
            enum: ["today", "week", "month"],
          }),
        ],
      }),
    },
    "/team/members/{adminId}": {
      get: op("getTeamMember", "One member's hub", "team", "team:read", {
        description:
          "Member summary (incl. current-month re-bill collection progress in `summary.monthly`) plus the attributed client slices (MRR, health/stage chips, team, rebill status — null for manually-billed PepAds clients) and goal history.",
        parameters: [
          pathParam("adminId", "Admin id of the roster member"),
          q("timeframe", "Rollup window (default week)", {
            type: "string",
            enum: ["today", "week", "month"],
          }),
        ],
      }),
    },
    "/team/tasks": {
      get: op("listTeamTasks", "List tasks", "team", "team:read", {
        parameters: [
          q("adminId", "Assignee admin id"),
          q("status", "Task status", {
            type: "string",
            enum: ["todo", "in_progress", "review", "complete"],
          }),
          q("clientId", "Tagged client id"),
          q("search", "Substring match on title/description"),
          q("dueBefore", "Due on or before (yyyy-mm-dd)"),
          ...PAGINATION,
        ],
      }),
      post: op("createTeamTask", "Create a task", "team", "team:write", {
        description: "Tasks are assigned to ONE individual admin (adminId).",
        requestBody: { required: true, schema: teamTaskBody(["adminId", "title"]) },
      }),
    },
    "/team/tasks/{id}": {
      get: op("getTeamTask", "One task (with comments)", "team", "team:read", {
        parameters: [pathParam("id", "Task id")],
      }),
      patch: op("updateTeamTask", "Update a task", "team", "team:write", {
        description:
          "Partial update. Setting status=complete solves the linked action item (and reopening un-solves it).",
        parameters: [pathParam("id", "Task id")],
        requestBody: { required: true, schema: teamTaskBody() },
      }),
      delete: op("deleteTeamTask", "Delete a task", "team", "team:delete", {
        parameters: [pathParam("id", "Task id")],
      }),
    },
    "/team/tasks/{id}/comments": {
      post: op("createTeamTaskComment", "Comment on a task", "team", "team:write", {
        description:
          'Append a progress note to the task\'s comment/activity trail (e.g. a daily follow-up: "still unsolved, day 3"). Author is recorded as the API token. Read comments via getTeamTask.',
        parameters: [pathParam("id", "Task id")],
        requestBody: {
          required: true,
          schema: obj({ body: str("Comment text (max 5000 chars)") }, ["body"]),
        },
      }),
    },
    "/team/action-items": {
      get: op("listTeamActionItems", "List action items", "team", "team:read", {
        parameters: [
          q("adminId", "Routed member admin id"),
          q("status", "unsolved or solved", {
            type: "string",
            enum: ["unsolved", "solved"],
          }),
          q("clientId", "Tagged client id"),
          ...PAGINATION,
        ],
      }),
      post: op("createTeamActionItem", "Create an action item (+ linked task)", "team", "team:write", {
        description:
          "The agent ingest path: relay a Slack thread or dashboard report to a member's inbox. Auto-creates a linked task on their board and returns both.",
        requestBody: { required: true, schema: teamActionItemBody(["adminId", "body"]) },
      }),
    },
    "/team/action-items/{id}": {
      get: op("getTeamActionItem", "One action item", "team", "team:read", {
        parameters: [pathParam("id", "Action item id")],
      }),
      patch: op("updateTeamActionItem", "Solve / unsolve an action item", "team", "team:write", {
        description:
          "{ status: 'solved' | 'unsolved' }. Solving completes the linked task; unsolving reopens it (atomic two-way sync).",
        parameters: [pathParam("id", "Action item id")],
        requestBody: {
          required: true,
          schema: obj(
            { status: { type: "string", enum: ["solved", "unsolved"] } },
            ["status"]
          ),
        },
      }),
      delete: op("deleteTeamActionItem", "Delete an action item", "team", "team:delete", {
        description: "The linked task survives — it just loses its inbox entry.",
        parameters: [pathParam("id", "Action item id")],
      }),
    },
  },
};

/** Flat list of every operation with its path + method — used by docs/MCP. */
export interface FlatOperation extends OpenApiOperation {
  path: string;
  method: HttpMethod;
}

export function listOperations(): FlatOperation[] {
  const out: FlatOperation[] = [];
  for (const [path, methods] of Object.entries(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (operation) {
        out.push({ ...operation, path, method: method as HttpMethod });
      }
    }
  }
  return out;
}
