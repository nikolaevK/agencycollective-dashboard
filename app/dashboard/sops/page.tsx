"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { SopWorkspace } from "@/components/sop/SopWorkspace";

// Available to all admins — the dashboard layout already enforces a valid admin
// session; this surface has no extra permission gate.
export default function SopsPage() {
  return (
    <DashboardShell wide>
      <SopWorkspace />
    </DashboardShell>
  );
}
