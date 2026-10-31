"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Briefcase } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// Trigger looks like the shadcn Input; the list like SelectContent/SelectItem.
const INPUT_CLS =
  "relative flex h-9 w-full min-w-0 items-center rounded-3xl border border-transparent bg-input/50 px-3 py-1 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50";
const ITEM_CLS =
  "flex w-full cursor-default select-none items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground";
/** Same look as the shadcn Checkbox (a real one can't sit inside a <button>). */
const BOX_CLS = "flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-transparent transition-colors";

interface ServiceMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
}

export function ServiceMultiSelect({ value, onChange }: ServiceMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch preset services from DB
  const { data: services = [] } = useQuery<Array<{ id: string; name: string; internalLabel: string | null; rate: number }>>({
    queryKey: ["service-names-for-deals"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data ?? []).map((s: { id: string; name: string; internalLabel?: string | null; rate: number }) => ({
        id: s.id,
        name: s.name,
        internalLabel: s.internalLabel ?? null,
        rate: s.rate,
      }));
    },
    staleTime: 60_000,
  });
  // Deals store the INTERNAL label (falling back to name) — invoice headers
  // are shared across presets, so the label is the only distinguishing
  // identity. dealInvoiceGenerator resolves labels back to presets.
  const serviceNames = Array.from(new Set(services.map((s) => s.internalLabel || s.name)));

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
        className={cn(INPUT_CLS, "pl-9 pr-8 appearance-none text-left cursor-pointer")}
      >
        <Briefcase className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
          {displayText}
        </span>
        <ChevronDown className={cn(
          "absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform",
          open && "rotate-180"
        )} />
      </button>

      {open && (
        <div className="absolute z-[60] mt-1 w-full rounded-3xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10 animate-in fade-in-0 zoom-in-95 duration-100 max-h-60 overflow-y-auto">
          {/* Select All */}
          <button
            type="button"
            onClick={toggleAll}
            className={ITEM_CLS}
          >
            <div className={cn(
              BOX_CLS,
              allSelected
                ? "bg-primary border-primary text-primary-foreground"
                : "bg-input/90"
            )}>
              {allSelected && <Check className="size-3.5" />}
            </div>
            <span>Select All</span>
          </button>
          <div className="pointer-events-none -mx-1.5 my-1.5 h-px bg-border" />

          {/* Individual items */}
          {services.map((svc) => {
            const label = svc.internalLabel || svc.name;
            const checked = value.includes(label);
            return (
              <button
                type="button"
                key={svc.id}
                onClick={() => toggleItem(label)}
                className={ITEM_CLS}
              >
                <div className={cn(
                  BOX_CLS,
                  checked
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-input/90"
                )}>
                  {checked && <Check className="size-3.5" />}
                </div>
                <span className="flex-1 text-left">{label}</span>
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
