import type { UserStatus } from "@/lib/users";
import type { ClientAccount } from "@/lib/clientAccounts";
import type { ClientBilling, RebillSchedule } from "@/lib/clientBilling";

export interface ClientPublic {
  id: string;
  slug: string;
  accountId: string;
  displayName: string;
  logoPath: string | null;
  email: string | null;
  status: UserStatus;
  mrr: number;
  payoutMrr: number;
  totalRevenue: number;
  category: string | null;
  createdAt: string;
  hasPassword: boolean;
  analystEnabled: boolean;
  designBoardEnabled: boolean;
  designBoardUrl: string | null;
  accounts: ClientAccount[];
  // Client Directory additions (payout cross-reference + re-bill schedule)
  payoutBrand: string | null;
  matchedBrand: string | null;
  isLinked: boolean;
  joinedAt: string | null;
  billing: ClientBilling | null;
  schedule: RebillSchedule;
}

/** A brand in the Payout DB not yet linked to a client (add-client picker). */
export interface PayoutPoolEntry {
  brandName: string;
  normalizedName: string;
  dateJoined: string | null;
  monthlyAmount: number; // cents
  totalPaid: number; // cents
  vertical: string | null;
  service: string | null;
}

export const CATEGORIES = [
  "E-commerce",
  "SaaS",
  "Real Estate",
  "Healthcare",
  "Retail",
  "Automotive",
  "Finance",
  "Education",
  "Travel",
  "Food & Beverage",
  "Beauty & Wellness",
  "Digital Marketing",
  "Technology",
  "Entertainment",
  "Research",
  "Other",
] as const;
