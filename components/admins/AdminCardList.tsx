"use client";

import { Pencil } from "lucide-react";
import { AdminAvatar } from "./AdminAvatar";
import { AdminRoleBadge } from "./AdminTable";
import type { AdminPublic } from "./types";
import { PERMISSION_MODULES } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface AdminCardListProps {
  admins: AdminPublic[];
  canMutate: boolean;
  onEdit: (admin: AdminPublic) => void;
}

export function AdminCardList({ admins, canMutate, onEdit }: AdminCardListProps) {
  if (admins.length === 0) {
    return (
      <Card className="md:hidden px-4 py-10 text-center text-sm text-muted-foreground">
        No admins found.
      </Card>
    );
  }

  return (
    <div className="md:hidden flex flex-col gap-3">
      {admins.map((admin) => {
        const activePerms = PERMISSION_MODULES.filter(
          (m) => admin.isSuper || admin.permissions[m.key]
        );
        const shown = activePerms.slice(0, 3);
        const more = activePerms.length - shown.length;

        return (
          <Card key={admin.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <AdminAvatar admin={admin} size={40} />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{admin.displayName || admin.username}</p>
                  {admin.email && <p className="text-xs text-muted-foreground truncate">{admin.email}</p>}
                </div>
              </div>
              <AdminRoleBadge admin={admin} />
            </div>

            {/* Permission chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {shown.map((mod) => (
                <Badge key={mod.key} variant="outline">
                  {mod.label}
                </Badge>
              ))}
              {more > 0 && (
                <Badge variant="secondary" className="text-muted-foreground">
                  +{more} more
                </Badge>
              )}
            </div>

            {canMutate && (
              <Button variant="outline" size="sm" onClick={() => onEdit(admin)} className="w-full">
                <Pencil />
                Edit
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
