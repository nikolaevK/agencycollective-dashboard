"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Briefcase } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const INPUT_CLS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-shadow";

interface ServiceMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
}

export function ServiceMultiSelect({ value, onChange }: ServiceMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch preset services from DB
  const { data: services = [] } = useQuery<Array<{ name: string; rate: number }>>({
    queryKey: ["service-names-for-deals"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data ?? []).map((s: { name: string; rate: number }) => ({ name: s.name, rate: s.rate }));
    },
    staleTime: 60_000,
  });
  const serviceNames = services.map((s) => s.name);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const allSelected = serviceNames.length > 0 && value.length === serviceNames.length;

  function toggleItem(item: string) {
    if (value.includes(item)) {
      onChange(value.filter((v) => v !== item));
    } else {
      onChange([...value, item]);
    }
  }

  function toggleAll() {
    if (allSelected) {
      onChange([]);
    } else {
      onChange([...serviceNames]);
    }
  }

  const displayText =
    value.length === 0
      ? "Select services..."
      : allSelected
        ? "All services"
        : value.join(", ");

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(INPUT_CLS, "pl-10 pr-8 appearance-none text-left cursor-pointer")}
      >
        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
          {displayText}
        </span>
        <ChevronDown className={cn(
          "absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-transform",
          open && "rotate-180"
        )} />
      </button>

      {open && (
        <div className="absolute z-[60] mt-1 w-full rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100 max-h-60 overflow-y-auto">
          {/* Select All */}
          <button
            type="button"
            onClick={toggleAll}
            className="flex w-full items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent transition-colors border-b border-border/50"
          >
            <div className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
              allSelected
                ? "bg-primary border-primary"
                : "border-input bg-background"
            )}>
              {allSelected && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
            <span className="text-sm font-medium text-foreground">Select All</span>
          </button>

          {/* Individual items */}
          {services.map((svc) => {
            const checked = value.includes(svc.name);
            return (
              <button
                type="button"
                key={svc.name}
                onClick={() => toggleItem(svc.name)}
                className="flex w-full items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
              >
                <div className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  checked
                    ? "bg-primary border-primary"
                    : "border-input bg-background"
                )}>
                  {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className="text-sm text-foreground flex-1 text-left">{svc.name}</span>
                {svc.rate > 0 && (
                  <span className="text-xs text-muted-foreground shrink-0">${(svc.rate / 100).toLocaleString()}</span>
                )}
              </button>
            );
          })}

          {services.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No services configured</p>
          )}
        </div>
      )}
    </div>
  );
}
