"use client";

import { useState } from "react";
import { ClipboardList, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSopLibrary } from "@/hooks/useSops";
import { SopLibrary } from "@/components/sop/SopLibrary";
import { SopChatInterface } from "@/components/sop/SopChatInterface";
import { SopBuilder } from "@/components/sop/SopBuilder";

type View = { kind: "list" } | { kind: "builder"; id: string };

export function SopWorkspace() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [tab, setTab] = useState<"library" | "assistant">("library");

  // Folder names for the builder's folder selector (cached, no filter).
  const { data } = useSopLibrary({});
  const folderNames = (data?.folders ?? []).map((f) => f.name);

  function openSop(id: string) {
    setView({ kind: "builder", id });
  }

  if (view.kind === "builder") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-foreground">SOP Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">Edit, preview, and export this Standard Operating Procedure.</p>
        </div>
        <SopBuilder
          key={view.id}
          sopId={view.id}
          folderNames={folderNames}
          onBack={() => setView({ kind: "list" })}
          onSaved={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-foreground">SOPs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create, organize, and generate Standard Operating Procedures for every department.
          </p>
        </div>
        <div className="flex bg-muted rounded-lg p-1 self-start">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
              tab === "library" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <ClipboardList className="h-4 w-4" />
            Library
          </button>
          <button
            type="button"
            onClick={() => setTab("assistant")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
              tab === "assistant" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Sparkles className="h-4 w-4" />
            AI Assistant
          </button>
        </div>
      </div>

      {tab === "library" ? <SopLibrary onOpenSop={openSop} /> : <SopChatInterface onOpenSop={openSop} />}
    </div>
  );
}
