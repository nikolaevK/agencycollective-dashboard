"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { TeamHome } from "@/components/team/TeamHome";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ~40KB of static docs — only fetched when the Documentation tab is opened.
const TeamGuide = dynamic(
  () => import("@/components/team/TeamGuide").then((m) => m.TeamGuide),
  { loading: () => <Skeleton className="h-72 w-full rounded-3xl" /> }
);

type TabId = "overview" | "docs";

export default function TeamPage() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">Team</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Client ownership, tasks &amp; MRR-managed goals — one hub per team member.
          </p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="docs">Documentation</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "overview" ? <TeamHome /> : <TeamGuide />}
      </div>
    </DashboardShell>
  );
}
