export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, parsePagination, paginate, readJsonBody } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { buildClientDirectory } from "@/lib/clientDirectory";
import {
  insertUser,
  updateUser,
  findUserByEmail,
  slugify,
  generateUniqueSlug,
  normalizeAccountId,
  type UserRecord,
  type UserStatus,
} from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES: UserStatus[] = ["active", "onboarding", "inactive", "archived"];

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Full Client Directory rows (payout cross-reference, billing schedule,
 * roster profile, team). Filters: ?status&search. Paginated + resource-scoped.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search")?.toLowerCase();

    let rows = await buildClientDirectory();
    const allowed = allowedResourceIds(auth.token, "client");
    if (allowed) rows = rows.filter((r) => allowed.includes(r.id));
    if (status && status !== "all") rows = rows.filter((r) => r.status === status);
    if (search) {
      rows = rows.filter(
        (r) =>
          r.displayName.toLowerCase().includes(search) ||
          r.email?.toLowerCase().includes(search) ||
          r.payoutBrand?.toLowerCase().includes(search)
      );
    }

    const { items, pagination } = paginate(rows, parsePagination(url));
    return okList(items, pagination);
  } catch (err) {
    console.error("GET /api/v1/client/clients error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Create a client. Body: { displayName, email, status?, mrrCents?,
 * category?, accountId?, joinedAt?, payoutBrand?, analystEnabled?,
 * designBoardEnabled? }. Mirrors createUserAction's validation (JSON, cents).
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
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
    if (await findUserByEmail(email)) {
      return fail("conflict", "A client with this email already exists", 409);
    }

    const status = body.status != null ? (String(body.status) as UserStatus) : "active";
    if (!VALID_STATUSES.includes(status)) {
      return fail("invalid_request", "Invalid status", 400);
    }
    const mrrCents = Number(body.mrrCents ?? 0);
    if (!Number.isInteger(mrrCents) || mrrCents < 0) {
      return fail("invalid_request", "mrrCents must be a non-negative integer", 400);
    }
    const joinedAt = body.joinedAt ? String(body.joinedAt).trim() : null;
    if (joinedAt && !DATE_RE.test(joinedAt)) {
      return fail("invalid_request", "joinedAt must be yyyy-mm-dd", 400);
    }

    const baseSlug = slugify(displayName);
    const user: UserRecord = {
      id: `${baseSlug}-${crypto.randomBytes(4).toString("hex")}`,
      slug: await generateUniqueSlug(baseSlug || "client"),
      accountId: body.accountId ? normalizeAccountId(String(body.accountId)) : "",
      displayName,
      logoPath: null,
      passwordHash: null,
      email,
      status,
      mrr: mrrCents,
      category: body.category ? String(body.category).trim() : null,
      createdAt: new Date().toISOString(),
      analystEnabled: body.analystEnabled !== undefined ? Boolean(body.analystEnabled) : true,
      designBoardEnabled:
        body.designBoardEnabled !== undefined ? Boolean(body.designBoardEnabled) : true,
      designBoardUrl: null,
      joinedAt: null,
      payoutBrand: null,
    };
    await insertUser(user);
    // insertUser ignores joinedAt/payoutBrand — follow with updateUser
    // (same two-step the from-payout route uses).
    const payoutBrand = body.payoutBrand ? String(body.payoutBrand).trim() : null;
    if (joinedAt || payoutBrand) {
      await updateUser(user.id, {
        ...(joinedAt ? { joinedAt } : {}),
        ...(payoutBrand ? { payoutBrand } : {}),
      });
      user.joinedAt = joinedAt;
      user.payoutBrand = payoutBrand;
    }

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.create",
      targetType: "client",
      targetId: user.id,
      details: JSON.stringify({ displayName, email }),
    }).catch(() => {});

    const { passwordHash: _, ...safe } = user;
    return ok(safe, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/clients error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
