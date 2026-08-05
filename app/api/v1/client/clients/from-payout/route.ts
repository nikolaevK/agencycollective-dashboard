export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { tokenWorkspaceScope, tokenIsExternal } from "@/lib/apiScopes";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  insertUser,
  updateUser,
  readUsers,
  findUserByEmail,
  slugify,
  generateUniqueSlug,
  type UserRecord,
} from "@/lib/users";
import { listWorkspaceValues } from "@/lib/workspaces";
import { normalizeBrandName, findLatestSourceDealIdForBrand } from "@/lib/payouts";
import { findDeal } from "@/lib/deals";
import { autofillClientProfileFromDeal } from "@/lib/clientProfile";
import { logAuditEvent } from "@/lib/auditLog";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Create a client from an unmatched payout brand (mirrors the dashboard's
 * Add-from-payout). Body: { brandName, dateJoined?, monthlyMrrCents?,
 * category?, email? }. Auto-fills the roster profile from the brand's latest
 * imported deal (fill-only-when-empty, non-blocking warnings).
 */

/**
 * Workspace (book) a token-created client lands in. Optional body value is
 * honored when the token may touch that book AND it's a known slug (or one
 * of the token's own restricted books — those stay valid even if the
 * registry row was deleted, mirroring scoped admins). Default: a restricted
 * token's first book, else 'main'. Returns null for a disallowed value.
 */
async function resolveCreateWorkspace(
  token: { workspaces?: string[] | null },
  raw: unknown
): Promise<string | null> {
  const restriction = tokenWorkspaceScope(token as Parameters<typeof tokenWorkspaceScope>[0]);
  const requested = typeof raw === "string" ? raw.trim() : "";
  if (!requested) return restriction ? restriction[0] : "main";
  if (restriction) {
    return restriction.includes(requested) ? requested : null;
  }
  const valid = await listWorkspaceValues();
  return valid.has(requested) ? requested : null;
}

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  // Payout-DB flow (reads brand deals, stamps payout_brand) — internal only,
  // mirroring the payout-pool denial and the admin-side external 403.
  if (tokenIsExternal(auth.token)) {
    return fail(
      "resource_forbidden",
      "Workspace-restricted tokens cannot create clients from the Payout DB",
      403
    );
  }

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const brandName = String(body.brandName ?? "").trim().slice(0, 200);
    if (!brandName) return fail("invalid_request", "brandName is required", 400);

    // Reject a brand that already maps to a client.
    const normalized = normalizeBrandName(brandName);
    const users = await readUsers();
    const clash = users.find(
      (u) =>
        (u.payoutBrand && normalizeBrandName(u.payoutBrand) === normalized) ||
        normalizeBrandName(u.displayName) === normalized
    );
    if (clash) {
      return fail("conflict", "A client already exists for this brand", 409);
    }

    const dateJoined =
      body.dateJoined && DATE_RE.test(String(body.dateJoined)) ? String(body.dateJoined) : null;

    let email: string | null = null;
    if (body.email != null && String(body.email).trim() !== "") {
      email = String(body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return fail("invalid_request", "Invalid email address", 400);
      if (await findUserByEmail(email)) {
        return fail("conflict", "A client with this email already exists", 409);
      }
    }
    const mrrCents = Number(body.monthlyMrrCents ?? 0);
    if (!Number.isInteger(mrrCents) || mrrCents < 0) {
      return fail("invalid_request", "monthlyMrrCents must be a non-negative integer", 400);
    }

    const workspace = await resolveCreateWorkspace(auth.token, body.workspace);
    if (!workspace) {
      return fail(
        "invalid_request",
        "Unknown workspace, or this token is not allowed to create clients in it",
        400
      );
    }

    const baseSlug = slugify(brandName);
    const user: UserRecord = {
      id: `${baseSlug}-${crypto.randomBytes(4).toString("hex")}`,
      slug: await generateUniqueSlug(baseSlug || "client"),
      accountId: "",
      displayName: brandName,
      logoPath: null,
      passwordHash: null,
      email,
      status: "active",
      mrr: mrrCents,
      category: body.category ? String(body.category).trim() : null,
      createdAt: new Date().toISOString(),
      analystEnabled: true,
      designBoardEnabled: true,
      designBoardUrl: null,
      joinedAt: null,
      payoutBrand: null,
      workspace,
    };
    await insertUser(user);
    await updateUser(user.id, { joinedAt: dateJoined, payoutBrand: brandName });

    // Best-effort roster auto-fill from the brand's latest imported deal.
    const warnings: string[] = [];
    try {
      const dealId = await findLatestSourceDealIdForBrand(normalized);
      if (dealId) {
        const deal = await findDeal(dealId);
        if (deal) {
          const fill = await autofillClientProfileFromDeal(
            { ...deal, brandName },
            { resolvedUserId: user.id }
          );
          warnings.push(...fill.warnings);
        }
      }
    } catch (err) {
      console.error("[v1 clients/from-payout] auto-fill failed:", err);
      warnings.push("Client profile auto-fill failed.");
    }

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.create_from_payout",
      targetType: "client",
      targetId: user.id,
      details: JSON.stringify({ brandName }),
    }).catch(() => {});

    return ok({ id: user.id, slug: user.slug }, { warnings }, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/clients/from-payout error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
