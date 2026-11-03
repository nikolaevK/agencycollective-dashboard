"use client";

import { ChevronDown } from "lucide-react";

export interface JumpGroup {
  label: string;
  items: { id: string; label: string }[];
}

/** Mobile "Jump to section…" menu. A native <select> dressed as the kit
 *  SelectTrigger: no Radix in the page chunk, and phones get their own picker.
 *  Controlled at "" so it always shows the placeholder — picking an entry
 *  only scrolls to it, and picking the same entry again jumps again. */
export function ApiDocsJumpMenu({ groups }: { groups: JumpGroup[] }) {
  return (
    <div className="relative min-w-0">
      <select
        value=""
        onChange={(e) => {
          const id = e.target.value;
          if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
        }}
        aria-label="Jump to section"
        className="flex h-9 w-full cursor-pointer appearance-none truncate rounded-3xl border border-transparent bg-input/50 pl-3 pr-8 text-sm text-muted-foreground outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 dark:[color-scheme:dark] [&_optgroup]:bg-popover [&_optgroup]:text-popover-foreground [&_option]:bg-popover [&_option]:text-popover-foreground"
      >
        <option value="" disabled>
          Jump to section…
        </option>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
