"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Info button + popover explaining a metric (loaded only by cards that have one). */
export function StatInfo({ label, info }: { label: string; info: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className="-m-1.5 shrink-0 rounded-full p-1.5 text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 text-xs leading-relaxed text-muted-foreground">
        {info}
      </PopoverContent>
    </Popover>
  );
}
