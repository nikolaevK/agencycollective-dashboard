"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { useAdmin } from "@/components/providers/AdminProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { allowedCreativeTabs, resolveCreativeTab, type CreativeTabId } from "@/components/creative/creativeTabs";

function PanelLoading() {
  return <Skeleton className="h-full min-h-[24rem] w-full flex-1 rounded-3xl" />;
}

// Each tool is its own chunk, fetched the first time its tab opens. Client-only:
// the tools read the shell's accounts query, which could otherwise land before
// this boundary hydrates (React #425 — see hooks/useHydrated.ts).
const PANELS: Record<CreativeTabId, ComponentType<{ active?: boolean }>> = {
  analyst: dynamic(() => import("@/components/chat/ChatInterface").then((m) => m.ChatInterface), {
    ssr: false,
    loading: PanelLoading,
  }),
  image: dynamic(() => import("@/components/generate/ImageGenerator").then((m) => m.ImageGenerator), {
    ssr: false,
    loading: PanelLoading,
  }),
  json: dynamic(() => import("@/components/json-editor/JsonImageEditor").then((m) => m.JsonImageEditor), {
    ssr: false,
    loading: PanelLoading,
  }),
  "ad-copy": dynamic(() => import("@/components/ad-copy/AdCopyGenerator").then((m) => m.AdCopyGenerator), {
    ssr: false,
    loading: PanelLoading,
  }),
};

export function CreativeStudio() {
  const admin = useAdmin();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabs = allowedCreativeTabs(admin);
  const active = resolveCreativeTab(admin, searchParams.get("tab"));
  const SinglePanel = tabs.length === 1 && active ? PANELS[active] : null;

  // Tabs mount on first open and then stay mounted (hidden), so switching
  // tools never throws away a conversation, a generated image or a draft.
  const [visited, setVisited] = useState<CreativeTabId[]>(() => (active ? [active] : []));
  if (active && !visited.includes(active)) setVisited([...visited, active]);

  // The tab row scrolls sideways on phones — keep the active tab in view.
  const activeTabRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const selectTab = useCallback(
    (id: string) => {
      // The live URL, not this render's searchParams: a param written since
      // (e.g. a new date range) must not be overwritten with its old value.
      const params = new URLSearchParams(window.location.search);
      params.set("tab", id);
      // Native history keeps Next's searchParams in sync without a server
      // round-trip; replace, like the date range, so Back leaves the page.
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    },
    [pathname]
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Manual activation: arrow keys only move focus along the tab row (an
          opened tool may focus its own input); Enter / Space opens the tool. */}
      <Tabs value={active ?? ""} onValueChange={selectTab} activationMode="manual" className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-[120rem] shrink-0 space-y-3 px-4 pt-3 md:space-y-4 md:px-6 md:pt-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl lg:text-3xl">Creative Studio</h2>
            <p className="mt-1 hidden text-sm text-muted-foreground md:block">
              AI analysis, image generation, JSON image editing and ad copy for your Meta accounts.
            </p>
          </div>
          {tabs.length > 1 && (
            <div className="overflow-x-auto">
              <TabsList>
                {tabs.map((t) => (
                  <TabsTrigger key={t.id} value={t.id} ref={t.id === active ? activeTabRef : undefined}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          )}
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-[120rem] flex-1 flex-col px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-6 md:pt-4">
          {tabs.length > 1 &&
            tabs.map((t) => {
              const Panel = PANELS[t.id];
              // Every trigger has its panel (so aria-controls resolves); the
              // tool itself mounts the first time its tab opens. The panel
              // inherits the page's type, not the kit's text-sm.
              return (
                <TabsContent
                  key={t.id}
                  value={t.id}
                  forceMount
                  className="min-h-0 flex-col text-[length:inherit] data-[state=active]:flex data-[state=inactive]:hidden"
                >
                  {visited.includes(t.id) && <Panel active={t.id === active} />}
                </TabsContent>
              );
            })}
          {SinglePanel && (
            <div className="flex min-h-0 flex-1 flex-col">
              <SinglePanel active />
            </div>
          )}
          {!active && (
            <p className="text-sm text-muted-foreground">You don&apos;t have access to any Creative Studio tools.</p>
          )}
        </div>
      </Tabs>
    </main>
  );
}
