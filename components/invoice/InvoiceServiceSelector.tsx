"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { InvoiceServiceRecord } from "@/lib/invoiceServices";
import type { InvoiceItem } from "@/types/invoice";
import { cn } from "@/lib/utils";

interface Props {
  onSelect: (item: InvoiceItem) => void;
}

export function InvoiceServiceSelector({ onSelect }: Props) {
  const [open, setOpen] = useState(false);

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
  };

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  if (services.length === 0) return null;

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
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-2 w-80 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
            {services.map((service) => (
              <button
                key={service.id}
                onClick={() => handleSelect(service)}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors border-b border-border/50 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {service.name}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {service.description.split("\n")[0]}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-foreground">
                  ${(service.rate / 100).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
