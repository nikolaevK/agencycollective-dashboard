export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createPayoutOptionHandlers } from "@/lib/api/payoutOptionRoutes";
import {
  readReferralOptions,
  addReferralOption,
  removeReferralOption,
} from "@/lib/payouts";

const handlers = createPayoutOptionHandlers({
  kind: "referrals",
  read: readReferralOptions,
  add: addReferralOption,
  remove: removeReferralOption,
});

export const { GET, POST, DELETE, OPTIONS } = handlers;
