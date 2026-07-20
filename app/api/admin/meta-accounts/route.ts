export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { buildMetaAccountDirectory } from "@/lib/metaAccountDirectory";
import {
  createMetaAccount,
  DuplicateMetaAccountEmailError,
  type MetaAccountInput,
} from "@/lib/metaAccounts";
import { logAuditEvent } from "@/lib/auditLog";
import { requireAdminRecord as requireAdmin } from "@/lib/api/requireAdmin";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Fields the client may set on create (credentials + checklist + pipeline). */
function readInput(body: Record<string, unknown>): MetaAccountInput {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  const b = (k: string) => (typeof body[k] === "boolean" ? (body[k] as boolean) : undefined);
  return {
    fbEmail: s("fbEmail"),
    fbPassword: s("fbPassword"),
    twofaSecret: s("twofaSecret"),
    twofaLink: s("twofaLink"),
    mailPassword: s("mailPassword"),
    recoveryEmail: s("recoveryEmail"),
    profileName: s("profileName"),
    profileLink: s("profileLink"),
    bmId: s("bmId"),
    loginOk: b("loginOk"),
    pageMade: b("pageMade"),
    adAccountMade: b("adAccountMade"),
    bmMade: b("bmMade"),
    cardAdded: b("cardAdded"),
    stage: s("stage"),
    status: s("status"),
    assignee: s("assignee"),
    clientId: s("clientId"),
    batch: s("batch"),
    notes: s("notes"),
  };
}

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  await ensureMigrated();
  const directory = await buildMetaAccountDirectory();
  return NextResponse.json({ data: directory });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  await ensureMigrated();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = readInput(body);
  if (!input.fbEmail || !input.fbEmail.trim()) {
    return NextResponse.json({ error: "An account email is required" }, { status: 400 });
  }

  let account;
  try {
    account = await createMetaAccount(input);
  } catch (err) {
    if (err instanceof DuplicateMetaAccountEmailError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  logAuditEvent({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "meta_account.create",
    targetType: "meta_account",
    targetId: account.id,
    details: JSON.stringify({ fbEmail: account.fbEmail, stage: account.stage, batch: account.batch }),
  }).catch(() => {});

  return NextResponse.json({ data: account });
}
