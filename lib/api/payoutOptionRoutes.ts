import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { logAuditEvent } from "@/lib/auditLog";

/**
 * Factory for the three payout lookup-option routes (sales-reps, verticals,
 * referrals) — identical GET/POST/DELETE shape over different lib fns.
 */
export function createPayoutOptionHandlers(config: {
  kind: string;
  read: () => Promise<string[]>;
  add: (name: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
}) {
  const { kind, read, add, remove } = config;

  return {
    OPTIONS() {
      return corsPreflight();
    },

    async GET(request: Request) {
      const auth = await authenticateApiRequest(request, "closer:read");
      if (!auth.ok) return auth.response;
      const options = await read();
      return ok(options);
    },

    async POST(request: Request) {
      const auth = await authenticateApiRequest(request, "closer:write");
      if (!auth.ok) return auth.response;
      try {
        const body = await readJsonBody(request);
        const name = String(body?.name ?? "").trim().slice(0, 200);
        if (!name) return fail("invalid_request", "name is required", 400);
        await add(name);
        logAuditEvent({
          ...tokenAuditActor(auth.token),
          action: `payout_option.add`,
          targetType: "payout_option",
          targetId: `${kind}:${name}`,
        }).catch(() => {});
        return ok(await read(), undefined, { status: 201 });
      } catch (err) {
        console.error(`POST /api/v1/closer/payouts/${kind} error:`, err);
        return fail("internal_error", "Internal server error", 500);
      }
    },

    async DELETE(request: Request) {
      const auth = await authenticateApiRequest(request, "closer:delete");
      if (!auth.ok) return auth.response;
      try {
        const name = new URL(request.url).searchParams.get("name")?.trim();
        if (!name) return fail("invalid_request", "name query param is required", 400);
        await remove(name);
        logAuditEvent({
          ...tokenAuditActor(auth.token),
          action: `payout_option.remove`,
          targetType: "payout_option",
          targetId: `${kind}:${name}`,
        }).catch(() => {});
        return ok(await read());
      } catch (err) {
        console.error(`DELETE /api/v1/closer/payouts/${kind} error:`, err);
        return fail("internal_error", "Internal server error", 500);
      }
    },
  };
}
