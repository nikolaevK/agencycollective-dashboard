"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { FolderOpen, Sparkles, Activity } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAdmin } from "@/components/providers/AdminProvider";
import { MediaDocumentsDirectory } from "@/components/media/MediaDocumentsDirectory";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// The AI assistant (chat + markdown + PDF export) and the activity feed are
// their own chunks, fetched the first time their tab opens — the Directory
// (default tab) doesn't pay for them.
const MediaChatInterface = dynamic(
  () => import("@/components/media/MediaChatInterface").then((m) => m.MediaChatInterface),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[calc(100dvh-20rem-env(safe-area-inset-bottom))] min-h-[22rem] w-full rounded-3xl md:h-[calc(100dvh-16rem)] md:min-h-[28rem]" />,
  }
);
const MediaActivityFeed = dynamic(
  () => import("@/components/media/MediaActivityFeed").then((m) => m.MediaActivityFeed),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full rounded-3xl" /> }
);

type TabId = "directory" | "assistant" | "activity";

const TABS: { id: TabId; label: string; icon: typeof FolderOpen }[] = [
  { id: "directory", label: "Directory", icon: FolderOpen },
  { id: "assistant", label: "AI Assistant", icon: Sparkles },
  { id: "activity", label: "Activity", icon: Activity },
];

export default function MediaBuyersPage() {
  const admin = useAdmin();
  const [tab, setTab] = useState<TabId>("directory");

  const isManager = admin.isSuper || admin.permissions.media_manage;

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">Media Buyers</h2>
            {isManager && <Badge variant="outline">Head of Paid Media</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Paid-media documentation, AI drafting assistant, and team activity.
          </p>
        </div>

        {/* The row scrolls sideways on the narrowest phones instead of
            widening the page. */}
        <div className="overflow-x-auto">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
            <TabsList>
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger key={t.id} value={t.id}>
                    <Icon className="hidden sm:block" />
                    {t.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {tab === "directory" && <MediaDocumentsDirectory isManager={isManager} />}
        {tab === "assistant" && <MediaChatInterface />}
        {tab === "activity" && <MediaActivityFeed isManager={isManager} />}
      </div>
    </DashboardShell>
  );
}
