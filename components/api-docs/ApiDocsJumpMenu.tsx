"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface JumpGroup {
  label: string;
  items: { id: string; label: string }[];
}

/** Mobile "Jump to section…" menu. Always shows the placeholder (value "")
 *  — picking an entry only scrolls to it, like the old reset-on-change select. */
export function ApiDocsJumpMenu({ groups }: { groups: JumpGroup[] }) {
  return (
    <Select
      value=""
      onValueChange={(id) => {
        if (!id) return;
        // After the menu has closed and handed focus back to the trigger.
        setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 0);
      }}
    >
      <SelectTrigger aria-label="Jump to section">
        <SelectValue placeholder="Jump to section…" />
      </SelectTrigger>
      <SelectContent className="max-w-[calc(100vw-2rem)]">
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.items.map((item) => (
              <SelectItem key={item.id} value={item.id} className="break-all">
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
