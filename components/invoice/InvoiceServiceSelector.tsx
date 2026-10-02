"use client";

import { useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { InvoiceServiceRecord } from "@/lib/invoiceServices";
import type { InvoiceItem } from "@/types/invoice";
import { cn } from "@/lib/utils";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/** A search box only earns its space once the catalog is long. */
const SEARCH_THRESHOLD = 6;

interface Props {
  onSelect: (item: InvoiceItem) => void;
  /** Which edge of the trigger the panel aligns to. Default "left" (opens
   *  rightward, unchanged for existing callers). Use "right" when the trigger
   *  sits near a right viewport/drawer edge so the panel doesn't clip. */
  align?: "left" | "right";
}

export function InvoiceServiceSelector({ onSelect, align = "left" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: services = [] } = useQuery<InvoiceServiceRecord[]>({
    queryKey: ["invoice-services"],
    queryFn: async () => {
      const res = await fetch("/api/admin/invoice-services");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  const handleSelect = (service: InvoiceServiceRecord) => {
    onSelect({
      id: crypto.randomUUID(),
      name: service.name,
      description: service.description,
      quantity: 1,
      unitPrice: service.rate / 100,
      total: service.rate / 100,
    });
    setOpen(false);
    setQuery("");
  };

  // Nesting-aware: inside an invoice drawer, Escape closes only this panel,
  // not the drawer (and its unsaved edits) underneath.
  useEscapeKey(() => setOpen(false), open);

  if (services.length === 0) return null;

  const q = query.trim().toLowerCase();
  const visible = q
    ? services.filter((s) =>
        [s.internalLabel, s.name, s.description].some((f) => (f ?? "").toLowerCase().includes(q))
      )
    : services;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Service
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent"
            onClick={() => setOpen(false)}
          />
          {/* Phones: a bottom sheet (an anchored panel ran off-screen when the
              trigger wasn't at the left edge). sm+: anchored dropdown. */}
          <div
            className={cn(
              "fixed inset-x-4 bottom-4 z-50 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-2 sm:w-80 sm:max-h-72",
              align === "right" ? "sm:right-0" : "sm:left-0"
            )}
          >
            {services.length > SEARCH_THRESHOLD && (
              <div className="sticky top-0 z-10 border-b border-border/50 bg-popover p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search services…"
                    aria-label="Search preset services"
                    className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
            )}
            {visible.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No services match.</p>
            )}
            {visible.map((service) => (
              <button
                type="button"
                key={service.id}
                onClick={() => handleSelect(service)}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors border-b border-border/50 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium text-foreground truncate"
                    title={service.internalLabel || service.name}
                  >
                    {service.internalLabel || service.name}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {service.description.split("\n")[0]}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-foreground">
                  {(service.rate / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: service.rate % 100 === 0 ? 0 : 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
