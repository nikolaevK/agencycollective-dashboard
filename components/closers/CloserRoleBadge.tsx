import { Badge } from "@/components/ui/badge";
import { formatRole } from "./types";

export function CloserRoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="secondary" className="font-medium">
      {formatRole(role)}
    </Badge>
  );
}
