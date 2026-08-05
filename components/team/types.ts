/**
 * Client-side types for the Team hub — type-only re-exports of the server
 * payload shapes (zero runtime imports from db-touching modules).
 */
import type {
  TeamDirectory,
  TeamMemberHub,
  TeamTimeframe,
} from "@/lib/teamHub";

export type {
  TeamDirectory,
  TeamMemberHub,
  TeamMemberSummary,
  TeamClientSlice,
  TeamTimeframe,
  RebillRollup,
  CsmSplitAssignment,
} from "@/lib/teamHub";
export type {
  MonthlyRebillProgress,
  MonthlyRebillBucket,
  MonthlyRetention,
} from "@/lib/teamRebill";
export type { TeamMemberRecord, TeamAttribution, UnrosteredAssignee } from "@/lib/teamMembers";
export type {
  TeamTaskRecord,
  TeamTaskComment,
  TeamTaskTag,
  TaggedTaskRecord,
  TaskChecklistItem,
  TaskStatus,
  TaskPriority,
  TaskStats,
} from "@/lib/teamTasks";
export type { TeamTaskDocument } from "@/lib/teamTaskDocuments";
export type { TeamActionItemRecord, ActionSourceType } from "@/lib/teamActionItems";

export interface TeamViewer {
  /** Members this viewer manages as a Head of Ads book manager (empty when
   *  privileged — privileged viewers can open everyone). Absent on the
   *  member-hub payload. */
  managedAdminIds?: string[];
  adminId: string;
  privileged: boolean;
}

export type TeamDirectoryPayload = TeamDirectory & { viewer: TeamViewer };
export type MemberHubPayload = TeamMemberHub & { viewer: TeamViewer };

export type TeamTimeframeValue = TeamTimeframe;
