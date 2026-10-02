import { sendPushToAllAdmins } from "./pushNotifications";
import { formatCentsExact } from "./format";

/**
 * Web Push heads-up that an agent prepared something for review. The push
 * broadcasts to every subscribed admin (lib/pushNotifications), partner-book
 * admins included — so it names the amount and the preparer, never a client.
 * Best-effort: a push failure must never fail the draft write.
 */
export async function notifyDraftAwaitingReview(params: {
  kind: "deal" | "client_rebill" | "ad_account";
  draftId: string;
  preparedBy: string;
  amountCents: number;
}): Promise<void> {
  const what =
    params.kind === "deal" ? "deal" : params.kind === "client_rebill" ? "re-bill invoice" : "ad-account invoice";
  try {
    await sendPushToAllAdmins({
      title: `New ${what} draft awaiting approval`,
      body: `${params.preparedBy} prepared a ${formatCentsExact(params.amountCents)} ${what} for review`,
      url: params.kind === "deal" ? "/dashboard/closers/deals?drafts=1" : "/dashboard/users?drafts=1",
      tag: `draft-${params.draftId}`,
    });
  } catch (err) {
    console.error("[notifyDraftAwaitingReview] push failed:", err);
  }
}
