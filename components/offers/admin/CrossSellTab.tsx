"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { OfferRequestsInbox } from "./OfferRequestsInbox";
import { OfferCatalogManager } from "./OfferCatalogManager";
import { OfferPageEditor } from "./OfferPageEditor";

/**
 * Client Directory → Cross-sell: the portal's "More from Agency Collective"
 * tab, admin side. Requests = leads clients filed; Catalog = the services
 * (add, publish, retire); Page design = every other word + the header image.
 */
export function CrossSellTab({ newRequests }: { newRequests: number }) {
  const [view, setView] = useState<"requests" | "catalog" | "page">("requests");
  // Once opened, the page design stays mounted (hidden) so switching views keeps unsaved edits.
  const [pageOpened, setPageOpened] = useState(false);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Portal cross-sell</h2>
        <p className="text-sm text-muted-foreground">
          Our other services, shown to every client in their portal. Everything clients see there is edited here;
          requests land here and ping admins.
        </p>
      </div>
      <div className="flex gap-1 border-b border-border/50">
        {(
          [
            ["requests", "Requests"],
            ["catalog", "Catalog"],
            ["page", "Page design"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setView(id);
              if (id === "page") setPageOpened(true);
            }}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              view === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {id === "requests" && newRequests > 0 && (
              <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {newRequests}
              </span>
            )}
          </button>
        ))}
      </div>
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
