export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, parsePagination, paginate, readJsonBody } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import {
  readClosers,
  insertCloser,
  findCloserByEmail,
  generateUniqueCloserSlug,
  type CloserRecord,
  type CloserRole,
} from "@/lib/closers";
import { slugify } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES: CloserRole[] = [
  "senior_closer",
  "account_executive",
  "inbound_specialist",
  "closer",
  "setter",
];

function stripHash(closer: CloserRecord) {
  const { passwordHash, ...rest } = closer;
  return { ...rest, hasPassword: passwordHash !== null };
}

export function OPTIONS() {
  return corsPreflight();
}

/** List closers + setters. Filters: ?status&role, paginated + resource-scoped. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const role = url.searchParams.get("role");

    let closers = await readClosers();
    const allowed = allowedResourceIds(auth.token, "closer");
    if (allowed) closers = closers.filter((c) => allowed.includes(c.id));
    if (status && status !== "all") closers = closers.filter((c) => c.status === status);
    if (role) closers = closers.filter((c) => c.role === role);

    const { items, pagination } = paginate(closers.map(stripHash), parsePagination(url));
    return okList(items, pagination);
  } catch (err) {
    console.error("GET /api/v1/closer/closers error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Create a closer/setter. Body: { displayName, email, role?,
 * commissionRateBps? (int basis points), quotaCents? (int cents), status? }.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const displayName = String(body.displayName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!displayName || !email) {
      return fail("invalid_request", "displayName and email are required", 400);
    }
    if (!EMAIL_RE.test(email)) {
      return fail("invalid_request", "Invalid email address", 400);
    }
    const role = body.role != null ? (String(body.role) as CloserRole) : "closer";
    if (!VALID_ROLES.includes(role)) {
      return fail("invalid_request", "Invalid role", 400);
    }
    const commissionRateBps = Number(body.commissionRateBps ?? 0);
    if (!Number.isInteger(commissionRateBps) || commissionRateBps < 0 || commissionRateBps > 10_000) {
      return fail("invalid_request", "commissionRateBps must be an integer 0..10000", 400);
    }
    const quotaCents = Number(body.quotaCents ?? 0);
    if (!Number.isInteger(quotaCents) || quotaCents < 0) {
      return fail("invalid_request", "quotaCents must be a non-negative integer", 400);
    }
    const status = body.status != null ? String(body.status) : "active";
    if (status !== "active" && status !== "inactive") {
      return fail("invalid_request", "Invalid status", 400);
    }

    if (await findCloserByEmail(email)) {
      return fail("conflict", "A closer with this email already exists", 409);
    }

    const baseSlug = slugify(displayName);
    const closer: CloserRecord = {
      id: `${baseSlug}-${crypto.randomBytes(4).toString("hex")}`,
      slug: await generateUniqueCloserSlug(baseSlug || "closer"),
      displayName,
      email,
      passwordHash: null,
      role,
      commissionRate: commissionRateBps,
      quota: quotaCents,
      status,
      avatarPath: null,
      createdAt: new Date().toISOString(),
    };
    await insertCloser(closer);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "closer.create",
      targetType: "closer",
      targetId: closer.id,
      details: JSON.stringify({ displayName, email, role }),
    }).catch(() => {});

    return ok(stripHash(closer), undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/closer/closers error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
