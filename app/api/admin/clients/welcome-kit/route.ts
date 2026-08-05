export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import {

  getWelcomeKitRecord,
  saveWelcomeKitDoc,
  setWelcomeKitShare,
  WelcomeKitConflictError,
} from "@/lib/welcomeKit";
import { requireInternalActor } from "@/lib/api/requireAdmin";


// The Welcome Kit is a single GLOBAL document (agency onboarding content) —
// internal-only; external (partner) scopes get 403 on every method.

/** Full kit record (doc + share state) for the builder. */
export async function GET() {
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;

  await ensureMigrated();
  const record = await getWelcomeKitRecord();
  return NextResponse.json({ data: record });
}

/** Save the kit document (validated/normalized server-side). */
export async function PUT(request: Request) {
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const admin = guard.actor.admin;

  await ensureMigrated();
  try {
    const body = (await request.json()) as {
      doc?: unknown;
      baseUpdatedAt?: string | null;
    };
    if (!body || typeof body !== "object" || !("doc" in body)) {
      return NextResponse.json({ error: "doc is required" }, { status: 400 });
    }
    const result = await saveWelcomeKitDoc(body.doc, admin.id, body.baseUpdatedAt);
    return NextResponse.json({ data: { doc: result.doc, updatedAt: result.updatedAt } });
  } catch (err) {
    if (err instanceof WelcomeKitConflictError) {
      // Surface the current server state so the editor can reload or overwrite.
      const current = await getWelcomeKitRecord();
      return NextResponse.json({ error: "conflict", data: current }, { status: 409 });
    }
    console.error("[welcome-kit] PUT failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Toggle public sharing of /welcome-kit. */
export async function PATCH(request: Request) {
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const admin = guard.actor.admin;

  await ensureMigrated();
  try {
    const body = (await request.json()) as { shareEnabled?: unknown };
    if (typeof body?.shareEnabled !== "boolean") {
      return NextResponse.json(
        { error: "shareEnabled (boolean) is required" },
        { status: 400 }
      );
    }
    await setWelcomeKitShare(body.shareEnabled, admin.id);
    return NextResponse.json({ data: { shareEnabled: body.shareEnabled } });
  } catch (err) {
    console.error("[welcome-kit] PATCH failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
