export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { allowedResourceIds } from "@/lib/apiScopes";
import { buildClientDirectory } from "@/lib/clientDirectory";
import { isRebillAlertStatus } from "@/lib/clientBilling";
import { listDueReminders } from "@/lib/clientNotes";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Due/overdue re-bill alerts + due note reminders. Mirrors the dashboard's
 * alerts route: active clients only, PepAds (manual-billing) book excluded.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  try {
    const [rows, reminders] = await Promise.all([
      buildClientDirectory(),
      listDueReminders(),
    ]);
    const allowed = allowedResourceIds(auth.token, "client");

    const rebills = rows
      .filter(
        (r) =>
          (!allowed || allowed.includes(r.id)) &&
          r.status === "active" &&
          r.profile.book !== "pepads" &&
          isRebillAlertStatus(r.schedule.status)
      )
      .map((r) => ({
        userId: r.id,
        displayName: r.displayName,
        payoutBrand: r.payoutBrand,
        payoutMrr: r.payoutMrr,
        status: r.schedule.status,
        nextRebillAt: r.schedule.nextRebillAt,
        daysUntilDue: r.schedule.daysUntilDue,
      }))
      .sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));

    const scopedReminders = allowed
      ? reminders.filter((rem) => allowed.includes(rem.userId))
      : reminders;

    return ok({
      rebills,
      reminders: scopedReminders,
      count: rebills.length + scopedReminders.length,
      overdueCount: rebills.filter((r) => r.status === "overdue").length,
    });
  } catch (err) {
    console.error("GET /api/v1/client/rebill-alerts error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
