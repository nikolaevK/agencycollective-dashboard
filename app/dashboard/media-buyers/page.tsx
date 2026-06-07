"use client";

import { useState } from "react";
import { FolderOpen, Sparkles, Activity } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAdmin } from "@/components/providers/AdminProvider";
import { MediaDocumentsDirectory } from "@/components/media/MediaDocumentsDirectory";
import { MediaChatInterface } from "@/components/media/MediaChatInterface";
import { MediaActivityFeed } from "@/components/media/MediaActivityFeed";
import { cn } from "@/lib/utils";

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
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-foreground">Media Buyers</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Paid-media documentation, AI drafting assistant, and team activity.
              {isManager && <span className="ml-1 font-medium text-primary">Head of Paid Media</span>}
            </p>
          </div>
          <div className="flex self-start rounded-lg bg-muted p-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
                    tab === t.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {tab === "directory" && <MediaDocumentsDirectory isManager={isManager} />}
        {tab === "assistant" && <MediaChatInterface />}
        {tab === "activity" && <MediaActivityFeed isManager={isManager} />}
      </div>
    </DashboardShell>
  );
}
