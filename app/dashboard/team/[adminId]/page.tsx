"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { MemberHub } from "@/components/team/MemberHub";

export default function TeamMemberPage({ params }: { params: { adminId: string } }) {
  return (
    <DashboardShell wide>
      <MemberHub adminId={params.adminId} />
    </DashboardShell>
  );
}
