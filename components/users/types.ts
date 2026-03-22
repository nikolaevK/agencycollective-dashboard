import type { UserStatus } from "@/lib/users";
import type { ClientAccount } from "@/lib/clientAccounts";

export interface ClientPublic {
  id: string;
  slug: string;
  accountId: string;
  displayName: string;
  logoPath: string | null;
  email: string | null;
  status: UserStatus;
  mrr: number;
  category: string | null;
  createdAt: string;
  hasPassword: boolean;
  accounts: ClientAccount[];
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
  "Other",
] as const;
