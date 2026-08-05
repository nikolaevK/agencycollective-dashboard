export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import {
  slugify,
  generateUniqueSlug,
  insertUser,
  updateUser,
  findUserByEmail,
  readUsers,
} from "@/lib/users";
import { normalizeBrandName, findLatestSourceDealIdForBrand } from "@/lib/payouts";
import { findDeal } from "@/lib/deals";
import { autofillClientProfileFromDeal } from "@/lib/clientProfile";
import { requireDirectoryActor } from "@/lib/api/requireAdmin";
import {
  isExternalScope,
  listWorkspaceValues,
  DEFAULT_WORKSPACE,
} from "@/lib/workspaces";

/**
 * Create a client seeded from a Payout-DB brand. Uses the SAME creation
 * invariants as createUserAction (slugify + generateUniqueSlug + accountId="")
 * so portal/account linkage behaves identically — it only additionally seeds
 * joined_at + payout_brand (the explicit link) via updateUser afterwards.
 *
 * Email is optional here (a payout brand may not have one yet); the client
 * simply can't log into the portal until an email is added, same as today.
 */
export async function POST(request: Request) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The Payout DB is internal-only: an external (partner) scope never reaches
  // the pool or this import. Internal admins may import straight into a
  // partner book via `workspace` (unscoped admins only — a scoped internal
  // admin stays inside their own books).
  if (isExternalScope(actor.scope)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureMigrated();

  try {
    const body = (await request.json()) as {
      brandName?: string;
      dateJoined?: string | null;
      monthlyAmount?: number | null; // cents
      category?: string | null;
      email?: string | null;
      workspace?: string | null;
    };

    const workspace = String(body.workspace ?? "").trim() || DEFAULT_WORKSPACE;
    if (workspace !== DEFAULT_WORKSPACE) {
      if (actor.scope !== null && !actor.scope.includes(workspace)) {
        return NextResponse.json(
          { error: "You don't have access to that workspace" },
          { status: 403 }
        );
      }
      // Registry membership is required only for unscoped actors — a scoped
      // internal admin's own scope is authoritative even if the registry row
      // was deleted (mirrors createUserAction).
      if (actor.scope === null) {
        const valid = await listWorkspaceValues();
        if (!valid.has(workspace)) {
          return NextResponse.json({ error: "Unknown workspace" }, { status: 400 });
        }
      }
    }

    const brandName = String(body.brandName ?? "").trim().slice(0, 200);
    if (!brandName) {
      return NextResponse.json({ error: "brandName is required" }, { status: 400 });
    }

    // Reject re-adding a brand already represented by a client (exact normalized
    // match on the explicit link or the display name) so the same payout brand
    // can't spawn duplicate clients from a stale picker / second tab.
    const brandNorm = normalizeBrandName(brandName);
    if (brandNorm) {
      const existingClients = await readUsers();
      const dup = existingClients.some(
        (u) =>
          (u.payoutBrand && normalizeBrandName(u.payoutBrand) === brandNorm) ||
          normalizeBrandName(u.displayName) === brandNorm
      );
      if (dup) {
        return NextResponse.json(
          { error: "A client for this brand already exists" },
          { status: 409 }
        );
      }
    }

    // Accept only a clean yyyy-mm-dd join date (the pool already supplies this);
    // anything else is ignored rather than silently shifting the billing anchor.
    const dateJoined =
      typeof body.dateJoined === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.dateJoined.slice(0, 10))
        ? body.dateJoined.slice(0, 10)
        : null;

    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
      const existing = await findUserByEmail(email);
      if (existing) {
        return NextResponse.json(
          { error: "A client with this email already exists" },
          { status: 409 }
        );
      }
    }

    // Mirror createUserAction's id/slug generation exactly.
    const baseSlug = slugify(brandName);
    const id = baseSlug + "-" + crypto.randomBytes(4).toString("hex");
    const slug = await generateUniqueSlug(baseSlug || "client");

    const mrr =
      typeof body.monthlyAmount === "number" && body.monthlyAmount > 0
        ? Math.round(body.monthlyAmount)
        : 0;

    await insertUser({
      id,
      slug,
      accountId: "", // legacy field — accounts managed via client_accounts
      displayName: brandName,
      logoPath: null,
      passwordHash: null,
      email,
      status: "active",
      mrr,
      category: body.category ? String(body.category).trim().slice(0, 100) : null,
      createdAt: new Date().toISOString(),
      analystEnabled: true,
      designBoardEnabled: true,
      designBoardUrl: null,
      joinedAt: null,
      payoutBrand: null,
      workspace,
    });

    // Persist the additive Client Directory fields (insertUser ignores them).
    await updateUser(id, {
      joinedAt: dateJoined,
      payoutBrand: brandName,
    });

    // If this brand's payouts trace back to an imported deal, seed the new
    // client's roster profile (website + services) from that deal. Best-effort
    // and non-blocking — the client is already created.
    const warnings: string[] = [];
    try {
      const sourceDealId = await findLatestSourceDealIdForBrand(brandNorm);
      if (sourceDealId) {
        const deal = await findDeal(sourceDealId);
        if (deal) {
          const fill = await autofillClientProfileFromDeal(deal, {
            resolvedUserId: id,
          });
          warnings.push(...fill.warnings);
        }
      }
    } catch (err) {
      console.error("[from-payout] profile auto-fill failed (non-fatal):", err);
      warnings.push("Client profile auto-fill failed.");
    }

    return NextResponse.json({ data: { id, slug }, warnings }, { status: 201 });
  } catch (err) {
    console.error("[from-payout] create failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
