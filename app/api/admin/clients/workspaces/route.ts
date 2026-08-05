export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireDirectoryActor } from "@/lib/api/requireAdmin";
import { listWorkspaces } from "@/lib/workspaces";

/**
 * Workspace (book) options visible to the acting admin — feeds the Add/Edit
 * client modals and the directory's workspace filter. Unscoped admins see
 * every workspace; scoped admins only their own (slugs without a registry
 * entry still render, labelled by slug, so a deleted registry row can't hide
 * an assigned book). Lives under /api/admin/clients/ so the `users`
 * permission gates it like the rest of the Client Directory.
 */
export async function GET() {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const all = await listWorkspaces();
  const labelByValue = new Map(all.map((w) => [w.value, w.label]));
  const workspaces =
    actor.scope === null
      ? all
      : actor.scope.map((value) => ({
          value,
          label: labelByValue.get(value) ?? value,
        }));

  return NextResponse.json({
    data: {
      workspaces,
      // Unscoped actors may move clients between books / manage the registry.
      canManage: actor.scope === null,
    },
  });
}
