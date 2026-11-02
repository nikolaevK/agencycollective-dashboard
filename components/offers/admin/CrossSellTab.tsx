"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OfferRequestsInbox } from "./OfferRequestsInbox";
import { OfferCatalogManager } from "./OfferCatalogManager";
import { OfferPageEditor } from "./OfferPageEditor";

type View = "requests" | "catalog" | "page";

/**
 * Client Directory → Cross-sell: the portal's "More from Agency Collective"
 * tab, admin side. Requests = leads clients filed; Catalog = the services
 * (add, publish, retire); Page design = every other word + the header image.
 */
export function CrossSellTab({ newRequests }: { newRequests: number }) {
  const [view, setView] = useState<View>("requests");
  // Once opened, the page design stays mounted (hidden) so switching views keeps unsaved edits.
  const [pageOpened, setPageOpened] = useState(false);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Portal cross-sell</h2>
        <p className="text-sm text-muted-foreground">
          Our other services, shown to every client in their portal. Everything clients see there is edited here;
          requests land here and ping admins.
        </p>
      </div>
      <Tabs
        value={view}
        onValueChange={(v) => {
          const id = v as View;
          setView(id);
          if (id === "page") setPageOpened(true);
        }}
      >
        <TabsList>
          {(
            [
              ["requests", "Requests"],
              ["catalog", "Catalog"],
              ["page", "Page design"],
            ] as const
          ).map(([id, label]) => (
            <TabsTrigger key={id} value={id}>
              {label}
              {id === "requests" && newRequests > 0 && (
                <Badge variant="destructive" className="h-4 min-w-4 px-1 tabular-nums">
                  {newRequests}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {view === "requests" && <OfferRequestsInbox />}
      {view === "catalog" && <OfferCatalogManager />}
      {pageOpened && (
        <div hidden={view !== "page"}>
          <OfferPageEditor />
        </div>
      )}
    </div>
  );
}
