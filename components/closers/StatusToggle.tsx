"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Active/inactive switch for a closer/setter row — shared by the table and
 * the mobile card list (previously two byte-identical copies, both of which
 * swallowed failures silently: the switch just didn't move).
 */
export function StatusToggle({ closerId, status }: { closerId: string; status: string }) {
  const queryClient = useQueryClient();
  const { toastError } = useToast();
  const [toggling, setToggling] = useState(false);
  const isActive = status === "active";

  const toggle = async () => {
    setToggling(true);
    try {
      const res = await fetch("/api/admin/closers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: closerId, status: isActive ? "inactive" : "active" }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["admin-closers"] });
      } else {
        const json = await res.json().catch(() => ({}));
        toastError(json.error ?? "Couldn't update status. Try again.");
      }
    } catch {
      toastError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setToggling(false);
    }
  };

  return (
    <label
      className="flex w-fit cursor-pointer items-center gap-2"
      title={isActive ? "Deactivate closer" : "Activate closer"}
    >
      <Switch checked={isActive} onCheckedChange={toggle} disabled={toggling} />
      <span className={cn(
        "text-xs font-medium",
        isActive ? "text-foreground" : "text-muted-foreground"
      )}>
        {isActive ? "Active" : "Inactive"}
      </span>
      {/* Always rendered so the row doesn't shift while the request runs. */}
      <Loader2
        aria-hidden
        className={cn("size-3 animate-spin text-muted-foreground", !toggling && "invisible")}
      />

    </label>
  );
}
