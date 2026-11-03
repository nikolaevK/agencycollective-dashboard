"use client";

import { Pencil, Trash2, ShieldCheck, Shield } from "lucide-react";
import { AdminAvatar } from "./AdminAvatar";
import { AdminPermissionGrid } from "./AdminPermissionGrid";
import { adminRoleLabel, type AdminPublic } from "./types";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AdminTableProps {
  admins: AdminPublic[];
  canMutate: boolean;
  onEdit: (admin: AdminPublic) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}

export function AdminRoleBadge({ admin }: { admin: AdminPublic }) {
  return admin.isSuper ? (
    <Badge variant="default">
      <ShieldCheck />
      Super Admin
    </Badge>
  ) : (
    <Badge variant="secondary">
      <Shield />
      {adminRoleLabel(admin.role)}
    </Badge>
  );
}

export function AdminTable({ admins, canMutate, onEdit, onDelete, isPending }: AdminTableProps) {
  return (
    <Card className="hidden md:block">
      <Table className="min-w-[680px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Admin</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead>Password</TableHead>
            {canMutate && (
              <TableHead className="pr-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {admins.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={canMutate ? 5 : 4} className="py-12 text-center text-muted-foreground">
                No admins found.
              </TableCell>
            </TableRow>
          )}
          {admins.map((admin) => {
            const name = admin.displayName || admin.username;
            return (
              <TableRow key={admin.id}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <AdminAvatar admin={admin} size={32} />
                    <div className="min-w-0 max-w-[16rem]">
                      <p className="font-medium truncate">{name}</p>
                      {admin.email && <p className="text-xs text-muted-foreground truncate">{admin.email}</p>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <AdminRoleBadge admin={admin} />
                </TableCell>
                <TableCell>
                  <AdminPermissionGrid permissions={admin.permissions} isSuper={admin.isSuper} />
                </TableCell>
                <TableCell>
                  <StatusBadge tone={admin.hasPassword ? "success" : "warning"}>
                    {admin.hasPassword ? "Set" : "Pending"}
                  </StatusBadge>
                </TableCell>
                {canMutate && (
                  <TableCell className="pr-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEdit(admin)}
                        disabled={isPending}
                        title="Edit admin"
                        aria-label={`Edit ${name}`}
                      >
                        <Pencil />
                      </Button>
                      {!admin.isSuper && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDelete(admin.id)}
                          disabled={isPending}
                          title="Delete admin"
                          aria-label={`Delete ${name}`}
                          className="hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
