import type { UserStatus } from "@/lib/users";
import type { ClientAccount } from "@/lib/clientAccounts";
import type { ClientBilling, RebillSchedule } from "@/lib/clientBilling";
import type { RebillInvoice } from "@/lib/clientRebillInvoices";
import type { ClientProfile, ClientTeamMember } from "@/lib/clientProfile";

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
  /** Active sent re-bill invoice awaiting payment, if any. Drives the
   *  `invoice_sent` schedule status and the Sent Invoices panel. */
  activeSentInvoice: RebillInvoice | null;
  // Roster additions (client_profile / client_team). `profile` is always set;
  // for book='pepads' the UI shows profile.manualBilling/manualNextRebill
  // instead of the computed schedule.
  profile: ClientProfile;
  team: ClientTeamMember[];
  /** Derived ad-spend fee from linked ad_accounts; profile.perfFee wins. */
  derivedPerfFee: string | null;
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
