export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createPayoutOptionHandlers } from "@/lib/api/payoutOptionRoutes";
import {
  readSalesRepOptions,
  addSalesRepOption,
  removeSalesRepOption,
} from "@/lib/payouts";

const handlers = createPayoutOptionHandlers({
  kind: "sales-reps",
  read: readSalesRepOptions,
  add: addSalesRepOption,
  remove: removeSalesRepOption,
});

export const { GET, POST, DELETE, OPTIONS } = handlers;
