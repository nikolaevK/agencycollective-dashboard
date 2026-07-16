import type { CloserStatus, CloserRole } from "@/lib/closers";
import type { DealStatus, ShowStatus } from "@/lib/deals";
import type { SetterTier } from "@/lib/appointments";

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
  setterId: string | null;
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
  brandName: string | null;
  website: string | null;
  paidStatus: "paid" | "unpaid";
  additionalCcEmails: string[];
  setterTier: SetterTier | null;
  noRetainer: boolean;
  createdAt: string;
  updatedAt: string;
}

export const CLOSER_ROLES = [
  { value: "senior_closer" as const, label: "Senior Closer" },
  { value: "account_executive" as const, label: "Account Executive" },
  { value: "inbound_specialist" as const, label: "Inbound Specialist" },
  { value: "closer" as const, label: "Closer" },
  { value: "setter" as const, label: "Setter" },
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

export { formatCents } from "@/lib/format";

export function formatBasisPoints(bp: number): string {
  return `${(bp / 100).toFixed(1)}%`;
}

// Shared revenue-chart series colors (TeamTrendChart + CloserPerformanceChart
// must stay identical so closed/paid read the same across both charts). The
// pair passes the palette checks — lightness band, chroma, CVD separation,
// 3:1 surface contrast — in light AND dark mode; don't swap for lighter
// tailwind steps without re-validating.
export const CHART_CLOSED_COLOR = "#7c3aed"; // violet-600
export const CHART_PAID_COLOR = "#059669"; // emerald-600
