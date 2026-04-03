import type { CloserStatus, CloserRole } from "@/lib/closers";
import type { DealStatus, ShowStatus } from "@/lib/deals";

export interface CloserPublic {
  id: string;
  slug: string;
  displayName: string;
  email: string;
  role: CloserRole;
  commissionRate: number; // basis points
  quota: number; // cents
  status: CloserStatus;
  avatarPath: string | null;
  createdAt: string;
  hasPassword: boolean;
}

export interface DealPublic {
  id: string;
  closerId: string;
  clientName: string;
  clientUserId: string | null;
  clientEmail: string | null;
  dealValue: number; // cents
  serviceCategory: string | null;
  industry: string | null;
  closingDate: string | null;
  status: DealStatus;
  showStatus: ShowStatus;
  notes: string | null;
  googleEventId: string | null;
  paymentType: string;
  createdAt: string;
  updatedAt: string;
}

export const CLOSER_ROLES = [
  { value: "senior_closer" as const, label: "Senior Closer" },
  { value: "account_executive" as const, label: "Account Executive" },
  { value: "inbound_specialist" as const, label: "Inbound Specialist" },
  { value: "closer" as const, label: "Closer" },
];

export const SERVICES_PURCHASED = [
  "Starter Complete",
  "Tiktok",
  "Meta Ads",
  "Email Marketing",
  "Creative Design",
  "Web Design",
] as const;

export const INDUSTRIES = [
  "Peptides",
  "Supplements",
  "Gambling",
  "Health",
] as const;

export const PAYMENT_TYPES = [
  { value: "local" as const, label: "Local (Zelle + Wire)" },
  { value: "international" as const, label: "International (Wire)" },
] as const;

export const DEAL_STATUSES = [
  { value: "closed" as const, label: "Closed" },
  { value: "not_closed" as const, label: "Not Closed" },
  { value: "pending_signature" as const, label: "Pending Signature" },
  { value: "rescheduled" as const, label: "Rescheduled" },
  { value: "follow_up" as const, label: "Follow Up" },
];

export function formatRole(role: string): string {
  return CLOSER_ROLES.find((r) => r.value === role)?.label ?? role;
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatBasisPoints(bp: number): string {
  return `${(bp / 100).toFixed(1)}%`;
}
