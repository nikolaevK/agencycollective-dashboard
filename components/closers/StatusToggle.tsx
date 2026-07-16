"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <button
      onClick={toggle}
      disabled={toggling}
      className="flex items-center gap-2 group"
      title={isActive ? "Deactivate closer" : "Activate closer"}
    >
      <div className={cn(
        "relative w-8 h-[18px] rounded-full transition-colors",
        isActive ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
      )}>
        {toggling ? (
          <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
        ) : (
          <div className={cn(
            "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform",
            isActive ? "translate-x-[16px]" : "translate-x-[2px]"
          )} />
        )}
      </div>
      <span className={cn(
        "text-[10px] font-bold uppercase tracking-wide",
        isActive ? "text-primary" : "text-gray-500 dark:text-gray-400"
      )}>
        {isActive ? "Active" : "Inactive"}
      </span>
    </button>
  );
}
