"use client";

import { useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { InvoiceServiceRecord } from "@/lib/invoiceServices";
import type { InvoiceItem } from "@/types/invoice";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        <Plus />
        Add Service
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </Button>

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
              "fixed inset-x-4 bottom-4 z-50 max-h-[60dvh] overscroll-contain overflow-y-auto rounded-3xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10 sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-2 sm:w-80 sm:max-h-72",
              align === "right" ? "sm:right-0" : "sm:left-0"
            )}
          >
            {services.length > SEARCH_THRESHOLD && (
              <div className="sticky top-0 z-10 border-b bg-popover p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search services…"
                    aria-label="Search preset services"
                    className="h-8 pl-9"
                  />
                </div>
              </div>
            )}
            {visible.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No services match.</p>
            )}
            {visible.length > 0 && (
              <div className="p-1.5">
                {visible.map((service) => (
                  <Button
                    type="button"
                    variant="ghost"
                    key={service.id}
                    onClick={() => handleSelect(service)}
                    className="h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-2xl px-3 py-2.5 text-left font-normal"
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
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {(service.rate / 100).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: service.rate % 100 === 0 ? 0 : 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
