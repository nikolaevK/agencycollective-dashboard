/**
 * Shared formatters for the Client Directory UI — now thin re-exports of the
 * central lib/format.ts (kept so existing imports don't break).
 */

import { formatCents, formatDate } from "@/lib/format";

/** Integer cents → whole-dollar currency string (NaN-safe). */
export const formatMoney = formatCents;

export { formatDate };
