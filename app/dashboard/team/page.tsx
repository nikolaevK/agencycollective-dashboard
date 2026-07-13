"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { TeamHome } from "@/components/team/TeamHome";
import { TeamGuide } from "@/components/team/TeamGuide";
import { cn } from "@/lib/utils";

type TabId = "overview" | "docs";

export default function TeamPage() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-foreground">Team</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Client ownership, tasks &amp; MRR-managed goals — one hub per team member.
            </p>
          </div>
          <div className="flex bg-muted rounded-lg p-1 self-start">
            <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
              Overview
            </TabButton>
            <TabButton active={tab === "docs"} onClick={() => setTab("docs")}>
              Documentation
            </TabButton>
          </div>
        </div>
        {tab === "overview" ? <TeamHome /> : <TeamGuide />}
      </div>
    </DashboardShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-md text-sm font-semibold transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
