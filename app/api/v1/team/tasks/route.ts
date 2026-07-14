export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, okList, fail, corsPreflight, readJsonBody, parsePagination } from "@/lib/api/respond";
import {
  listTasks,
  createTask,
  parseTaskStatus,
  parseTaskPriority,
  sanitizeChecklist,
} from "@/lib/teamTasks";
import { findAdmin } from "@/lib/admins";
import { findUser } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/** List tasks. Filters: ?adminId&status&clientId&search&dueBefore&taggedAdminId. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "team:read");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const statusParam = url.searchParams.get("status");
    if (statusParam && !parseTaskStatus(statusParam)) {
      return fail("invalid_request", "status must be todo, in_progress, review, or complete", 400);
    }
    const dueBefore = url.searchParams.get("dueBefore")?.trim() || undefined;
    if (dueBefore && !YMD_RE.test(dueBefore)) {
      return fail("invalid_request", "dueBefore must be yyyy-mm-dd", 400);
    }
    const { tasks, total } = await listTasks({
      adminId: url.searchParams.get("adminId")?.trim() || undefined,
      status: parseTaskStatus(statusParam) ?? undefined,
      clientId: url.searchParams.get("clientId")?.trim() || undefined,
      search: url.searchParams.get("search")?.trim() || undefined,
      dueBefore,
      taggedAdminId: url.searchParams.get("taggedAdminId")?.trim() || undefined,
      limit,
      offset,
    });
    return okList(tasks, { total, limit, offset });
  } catch (err) {
    console.error("GET /api/v1/team/tasks error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Create a task assigned to ONE individual admin. */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "team:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const adminId = typeof body.adminId === "string" ? body.adminId.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!adminId) return fail("invalid_request", "adminId is required", 400);
    if (!title) return fail("invalid_request", "title is required", 400);
    if (!(await findAdmin(adminId))) {
      return fail("not_found", "No admin with that adminId", 404);
    }
    if (body.status !== undefined && !parseTaskStatus(body.status)) {
      return fail("invalid_request", "status must be todo, in_progress, review, or complete", 400);
    }
    if (body.priority !== undefined && !parseTaskPriority(body.priority)) {
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
    const task = await createTask({
      adminId,
      title,
      description: typeof body.description === "string" ? body.description : "",
      clientId,
      status: parseTaskStatus(body.status) ?? undefined,
      priority: parseTaskPriority(body.priority) ?? undefined,
      dueDate: typeof body.dueDate === "string" ? body.dueDate : null,
      lineup: Boolean(body.lineup),
      checklist: sanitizeChecklist(body.checklist),
      source: "manual",
      createdBy: actor.adminId,
      createdByName: actor.adminUsername,
    });

    logAuditEvent({
      ...actor,
      action: "team.task_create",
      targetType: "team_task",
      targetId: task.id,
      details: JSON.stringify({ assignee: adminId, title: task.title }),
    }).catch(() => {});

    return ok(task, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/team/tasks error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
