"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Radix Select can't hold "" — the "all books" option's stand-in. */
const ALL_WORKSPACES = "__all__";

/**
 * The Team overview's book filter (super / Admin Management with several
 * workspaces only — loaded on demand, so other viewers never ship the Select).
 * `value` "" = all books.
 */
export function WorkspaceFilter({
  value,
  onChange,
  workspaces,
}: {
  value: string;
  onChange: (workspace: string) => void;
  workspaces: Array<{ value: string; label: string }>;
}) {
  return (
    <Select
      value={value || ALL_WORKSPACES}
      onValueChange={(v) => onChange(v === ALL_WORKSPACES ? "" : v)}
    >
      <SelectTrigger
        className="w-auto min-w-[10rem]"
        title="Filter the team overview to one workspace (book)"
        aria-label="Workspace"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_WORKSPACES}>All workspaces</SelectItem>
        {workspaces.map((w) => (
          <SelectItem key={w.value} value={w.value}>
            {w.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
