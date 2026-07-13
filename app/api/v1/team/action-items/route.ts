export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, readJsonBody, parsePagination } from "@/lib/api/respond";
import {
  listActionItems,
  createActionItem,
  parseActionSourceType,
} from "@/lib/teamActionItems";
import { parseTaskPriority } from "@/lib/teamTasks";
import { findAdmin } from "@/lib/admins";
import { findUser } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/** List action items. Filters: ?adminId&status&clientId. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "team:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const statusParam = url.searchParams.get("status");
    if (statusParam && statusParam !== "solved" && statusParam !== "unsolved") {
      return fail("invalid_request", "status must be 'solved' or 'unsolved'", 400);
    }
    const { items, total } = await listActionItems({
      adminId: url.searchParams.get("adminId")?.trim() || undefined,
      status:
        statusParam === "solved" || statusParam === "unsolved" ? statusParam : undefined,
      clientId: url.searchParams.get("clientId")?.trim() || undefined,
      limit,
      offset,
    });
    return okList(items, { total, limit, offset });
  } catch (err) {
    console.error("GET /api/v1/team/action-items error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * The agent ingest path: relay a Slack thread / dashboard report to one
 * member's inbox. Auto-creates the linked task and returns both.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "team:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const adminId = typeof body.adminId === "string" ? body.adminId.trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!adminId) return fail("invalid_request", "adminId is required", 400);
    if (!text) return fail("invalid_request", "body is required", 400);
    if (!(await findAdmin(adminId))) {
      return fail("not_found", "No admin with that adminId", 404);
    }
    const sourceType = parseActionSourceType(body.sourceType ?? "dashboard");
    if (!sourceType) {
      return fail("invalid_request", "sourceType must be slack, dashboard, or system", 400);
    }
    if (body.priority != null && !parseTaskPriority(body.priority)) {
      return fail("invalid_request", "priority must be urgent, high, normal, or low", 400);
    }
    if (body.dueDate != null && !(typeof body.dueDate === "string" && YMD_RE.test(body.dueDate))) {
      return fail("invalid_request", "dueDate must be yyyy-mm-dd", 400);
    }
    const clientId =
      typeof body.clientId === "string" && body.clientId ? body.clientId : null;
    if (clientId && !(await findUser(clientId))) {
      return fail("invalid_request", "Unknown clientId", 400);
    }

    const actor = tokenAuditActor(auth.token);
    const item = await createActionItem(
      {
        adminId,
        body: text,
        clientId,
        sourceType,
        sourceChannel: typeof body.sourceChannel === "string" ? body.sourceChannel : null,
        authorLabel: typeof body.authorLabel === "string" ? body.authorLabel : null,
        externalTs: typeof body.externalTs === "string" ? body.externalTs : null,
        taskTitle: typeof body.taskTitle === "string" ? body.taskTitle : null,
        dueDate: typeof body.dueDate === "string" ? body.dueDate : null,
        priority: typeof body.priority === "string" ? body.priority : null,
      },
      { id: actor.adminId, name: actor.adminUsername }
    );

    logAuditEvent({
      ...actor,
      action: "team.action_item_create",
      targetType: "team_action_item",
      targetId: item.id,
      details: JSON.stringify({ assignee: adminId, taskId: item.taskId, sourceType }),
    }).catch(() => {});

    return ok(item, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/team/action-items error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
