"use client";

import { Fragment, useState } from "react";
import dynamic from "next/dynamic";
import { ClipboardList, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSopLibrary } from "@/hooks/useSops";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SopLibrary } from "@/components/sop/SopLibrary";

// The builder (dnd sortable, block editors, markdown renderer) and the AI chat
// (markdown + stream parser) are their own chunks, fetched the first time a
// SOP is opened / the AI Assistant tab is picked — the library paints without them.
const SopBuilder = dynamic(() => import("@/components/sop/SopBuilder").then((m) => m.SopBuilder), {
  ssr: false,
  loading: BuilderLoading,
});
const SopChatInterface = dynamic(
  () => import("@/components/sop/SopChatInterface").then((m) => m.SopChatInterface),
  { ssr: false, loading: () => <Skeleton className="h-[28rem] w-full rounded-3xl" /> }
);

// Warm a chunk on intent (hover / focus) so opening it rarely waits on the network.
const warmBuilder = () => void import("@/components/sop/SopBuilder");
const warmChat = () => void import("@/components/sop/SopChatInterface");

function BuilderLoading() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-28 rounded-4xl" />
        <Skeleton className="h-9 w-40 rounded-4xl" />
      </div>
      <Card className="p-6 md:p-8">
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}

type View = { kind: "list" } | { kind: "builder"; id: string };
type TabId = "library" | "assistant";

export function SopWorkspace() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [tab, setTab] = useState<TabId>("library");
  // The AI chat mounts on its first open and then stays mounted (hidden while
  // another tab or the builder is showing), so an in-flight reply survives
  // switching tabs or opening a drafted SOP in the builder.
  const [chatVisited, setChatVisited] = useState(false);

  // Folder names for the builder's folder selector (cached, no filter).
  const { data } = useSopLibrary({});
  const folderNames = (data?.folders ?? []).map((f) => f.name);

  function openSop(id: string) {
    setView({ kind: "builder", id });
  }

  function selectTab(v: string) {
    setTab(v as TabId);
    if (v === "assistant") setChatVisited(true);
  }

  const chatShown = view.kind === "list" && tab === "assistant";

  return (
    <Tabs value={tab} onValueChange={selectTab} className="flex flex-col gap-6">
      {view.kind === "builder" ? (
        <Fragment key="builder">
          <div>
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">SOP Builder</h2>
            <p className="text-sm text-muted-foreground mt-1">Edit, preview, and export this Standard Operating Procedure.</p>
          </div>
          <SopBuilder
            key={view.id}
            sopId={view.id}
            folderNames={folderNames}
            onBack={() => setView({ kind: "list" })}
            onSaved={() => {}}
          />
        </Fragment>
      ) : (
        <Fragment key="list">
          <div>
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">SOPs</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create, organize, and generate Standard Operating Procedures for every department.
            </p>
          </div>
          <TabsList>
            <TabsTrigger value="library">
              <ClipboardList />
              Library
            </TabsTrigger>
            <TabsTrigger value="assistant" onPointerEnter={warmChat} onFocus={warmChat}>
              <Sparkles />
              AI Assistant
            </TabsTrigger>
          </TabsList>
          {/* The library unmounts while inactive, exactly like the old switch. */}
          <TabsContent
            value="library"
            onPointerEnter={warmBuilder}
            onFocusCapture={warmBuilder}
            className="min-w-0 text-[length:inherit]"
          >
            <SopLibrary onOpenSop={openSop} />
          </TabsContent>
        </Fragment>
      )}
      {chatVisited && (
        <TabsContent
          value="assistant"
          forceMount
          className={cn("min-w-0 text-[length:inherit]", !chatShown && "hidden")}
        >
          <SopChatInterface onOpenSop={openSop} />
        </TabsContent>
      )}
    </Tabs>
  );
}
