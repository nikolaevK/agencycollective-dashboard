"use client";

import { Pencil, Trash2, ShieldCheck, Shield } from "lucide-react";
import Image from "next/image";
import { AdminPermissionGrid } from "./AdminPermissionGrid";
import type { AdminPublic } from "./types";
import { getInitials } from "@/lib/utils";

interface AdminTableProps {
  admins: AdminPublic[];
  canMutate: boolean;
  onEdit: (admin: AdminPublic) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}

export function AdminTable({ admins, canMutate, onEdit, onDelete, isPending }: AdminTableProps) {
  return (
    <div className="hidden md:block rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Admin</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Permissions</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Password</th>
            {canMutate && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {admins.length === 0 && (
            <tr>
              <td colSpan={canMutate ? 5 : 4} className="px-4 py-8 text-center text-muted-foreground text-xs">
                No admins found.
              </td>
            </tr>
          )}
          {admins.map((admin) => (
            <tr key={admin.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold overflow-hidden shrink-0">
                    {admin.avatarPath ? (
                      <Image src={admin.avatarPath} alt="" width={32} height={32} className="h-full w-full object-cover" />
                    ) : (
                      getInitials(admin.displayName, admin.username)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{admin.displayName || admin.username}</p>
                    {admin.email && <p className="text-xs text-muted-foreground truncate">{admin.email}</p>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                {admin.isSuper ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <ShieldCheck className="h-3 w-3" />
                    Super Admin
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    <Shield className="h-3 w-3" />
                    {admin.role === "admin" ? "Admin" : admin.role}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <AdminPermissionGrid permissions={admin.permissions} isSuper={admin.isSuper} />
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    admin.hasPassword
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {admin.hasPassword ? "Set" : "Pending"}
                </span>
              </td>
              {canMutate && (
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(admin)}
                      disabled={isPending}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
                      title="Edit admin"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {!admin.isSuper && (
                      <button
                        onClick={() => onDelete(admin.id)}
                        disabled={isPending}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                        title="Delete admin"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
