import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface SortHeaderProps {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onToggle: () => void;
}

export function SortHeader({ label, active, direction, onToggle }: SortHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      aria-label={`Sort by ${label}`}
    >
      {label}
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}
