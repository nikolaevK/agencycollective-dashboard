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
  TaskChecklistItem,
  TaskStatus,
  TaskPriority,
  TaskStats,
} from "@/lib/teamTasks";
export type { TeamActionItemRecord, ActionSourceType } from "@/lib/teamActionItems";

export interface TeamViewer {
  adminId: string;
  privileged: boolean;
}

export type TeamDirectoryPayload = TeamDirectory & { viewer: TeamViewer };
export type MemberHubPayload = TeamMemberHub & { viewer: TeamViewer };

export type TeamTimeframeValue = TeamTimeframe;
