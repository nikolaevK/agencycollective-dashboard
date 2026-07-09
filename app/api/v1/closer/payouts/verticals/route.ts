export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createPayoutOptionHandlers } from "@/lib/api/payoutOptionRoutes";
import {
  readVerticalOptions,
  addVerticalOption,
  removeVerticalOption,
} from "@/lib/payouts";

const handlers = createPayoutOptionHandlers({
  kind: "verticals",
  read: readVerticalOptions,
  add: addVerticalOption,
  remove: removeVerticalOption,
});

export const { GET, POST, DELETE, OPTIONS } = handlers;
