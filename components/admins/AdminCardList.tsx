"use client";

import { Pencil, ShieldCheck, Shield } from "lucide-react";
import Image from "next/image";
import type { AdminPublic } from "./types";
import { PERMISSION_MODULES } from "@/lib/permissions";
import { getInitials } from "@/lib/utils";

interface AdminCardListProps {
  admins: AdminPublic[];
  canMutate: boolean;
  onEdit: (admin: AdminPublic) => void;
}

export function AdminCardList({ admins, canMutate, onEdit }: AdminCardListProps) {
  if (admins.length === 0) {
    return (
      <div className="md:hidden rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
        No admins found.
      </div>
    );
  }

  return (
    <div className="md:hidden space-y-3">
      {admins.map((admin) => {
        const activePerms = PERMISSION_MODULES.filter(
          (m) => admin.isSuper || admin.permissions[m.key]
        );
        const shown = activePerms.slice(0, 3);
        const more = activePerms.length - shown.length;

        return (
          <div
            key={admin.id}
            className="rounded-xl border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold overflow-hidden shrink-0">
                  {admin.avatarPath ? (
                    <Image src={admin.avatarPath} alt="" width={40} height={40} className="h-full w-full object-cover" />
                  ) : (
                    getInitials(admin.displayName, admin.username)
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">{admin.displayName || admin.username}</p>
                  {admin.email && <p className="text-xs text-muted-foreground">{admin.email}</p>}
                </div>
              </div>
              {admin.isSuper ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <ShieldCheck className="h-3 w-3" />
                  Super
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  Admin
                </span>
              )}
            </div>

            {/* Permission chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {shown.map((mod) => (
                <span key={mod.key} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {mod.label}
                </span>
              ))}
              {more > 0 && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  +{more} more
                </span>
              )}
            </div>

            {canMutate && (
              <button
                onClick={() => onEdit(admin)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
