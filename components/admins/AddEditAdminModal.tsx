"use client";

import { useState, useEffect, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AdminAvatarUpload } from "./AdminAvatarUpload";
import { AdminRoleSelect } from "./AdminRoleSelect";
import { PermissionToggleList } from "./PermissionToggleList";
import type { AdminPublic } from "./types";
import type { AdminPermissions, PermissionKey } from "@/lib/permissions";
import { allPermissionsFalse } from "@/lib/permissions";
import { cn, getInitials } from "@/lib/utils";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddEditAdminModalProps {
  open: boolean;
  admin: AdminPublic | null; // null = add mode
  onClose: () => void;
  onSave: (data: {
    id?: string;
    username?: string;
    displayName: string;
    email: string;
    role: string;
    permissions: AdminPermissions;
    workspaces?: string[] | null;
    avatarFile?: File;
  }) => void;
  isPending: boolean;
}

interface WorkspaceRegistryEntry {
  value: string;
  label: string;
  builtIn?: boolean;
}

export function AddEditAdminModal({ open, admin, onClose, onSave, isPending }: AddEditAdminModalProps) {
  const isEdit = admin !== null;
  const uid = useId();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [permissions, setPermissions] = useState<AdminPermissions>(allPermissionsFalse());
  const [avatarFile, setAvatarFile] = useState<File | undefined>(undefined);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  // Workspace (book) allow-list. Empty selection = legacy default (main book
  // only). Supers and Admin Management see every book regardless.
  const [workspaceSel, setWorkspaceSel] = useState<string[]>([]);

  const { data: registry = [] } = useQuery<WorkspaceRegistryEntry[]>({
    queryKey: ["workspace-registry"],
    queryFn: async () => {
      const res = await fetch("/api/admin/admins/workspaces");
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : [];
    },
    enabled: open,
    staleTime: 300_000,
  });

  useEffect(() => {
    if (open) {
      if (admin) {
        setUsername(admin.username);
        setDisplayName(admin.displayName ?? "");
        setEmail(admin.email ?? "");
        setRole(admin.role);
        setPermissions({ ...admin.permissions });
        setWorkspaceSel(admin.workspaces ?? []);
      } else {
        setUsername("");
        setDisplayName("");
        setEmail("");
        setRole("admin");
        setPermissions(allPermissionsFalse());
        setWorkspaceSel([]);
      }
      setAvatarFile(undefined);
      setAvatarPreview(null);
    }
  }, [open, admin]);

  useEscapeKey(onClose, open);

  if (!open) return null;

  function handlePermChange(key: PermissionKey, value: boolean) {
    setPermissions((prev) => ({ ...prev, [key]: value }));
  }

  function handleFileSelect(file: File) {
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      id: admin?.id,
      username: isEdit ? undefined : username.trim().toLowerCase(),
      displayName: displayName.trim(),
      email: email.trim(),
      role,
      permissions,
      workspaces: workspaceSel.length > 0 ? workspaceSel : null,
      avatarFile,
    });
  }

  const titleId = `${uid}-title`;

  return (
    <div className="fixed inset-0 z-[60] hidden md:flex items-center justify-center p-4">
      <div className={dialogOverlayClass} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(dialogPanelClass, "relative z-50 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden")}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-6 pb-4">
          <h2 id={titleId} className="text-base font-medium leading-none">
            {isEdit ? "Edit Admin" : "Add Admin"}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="bg-secondary">
            <X />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 pb-6">
            {/* Avatar */}
            <AdminAvatarUpload
              currentPath={admin?.avatarPath ?? null}
              initials={getInitials(displayName, username)}
              onFileSelect={handleFileSelect}
              previewUrl={avatarPreview}
            />

            {/* Username (create only) */}
            {!isEdit && (
              <div className="grid gap-2">
                <Label htmlFor={`${uid}-username`}>Username</Label>
                <Input
                  id={`${uid}-username`}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. john"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Used for login. Cannot be changed after creation.
                </p>
              </div>
            )}

            {/* Display Name + Email */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor={`${uid}-display`}>Display Name</Label>
                <Input
                  id={`${uid}-display`}
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${uid}-email`}>Email</Label>
                <Input
                  id={`${uid}-email`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
            </div>

            {/* Role — a label, not a permission preset: CSM/Media Buyer keep
                whatever module toggles are set below. */}
            {!admin?.isSuper && (
              <div className="grid gap-2">
                <Label htmlFor={`${uid}-role`}>Role</Label>
                <AdminRoleSelect id={`${uid}-role`} value={role} onChange={setRole} />
                <p className="text-xs text-muted-foreground">
                  A label shown across the dashboard — module permissions are set below.
                </p>
              </div>
            )}

            {/* Workspaces (books) — which Client Directory / Team books this
                admin sees. Only shown when partner workspaces exist. */}
            {!admin?.isSuper && registry.length > 1 && (
              <fieldset className="grid min-w-0 gap-2">
                <legend className="mb-2 text-sm font-medium leading-none">Client Directory Workspaces</legend>
                <div className="grid gap-1 rounded-2xl border p-2">
                  {registry.map((w) => {
                    const id = `${uid}-ws-${w.value}`;
                    return (
                      <label
                        key={w.value}
                        htmlFor={id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          id={id}
                          checked={workspaceSel.includes(w.value)}
                          onCheckedChange={(checked) =>
                            setWorkspaceSel((prev) =>
                              checked === true
                                ? [...prev, w.value]
                                : prev.filter((v) => v !== w.value)
                            )
                          }
                        />
                        <span>{w.label}</span>
                        {w.builtIn && (
                          <span className="text-xs text-muted-foreground">(main book)</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Which books this admin sees in the Client Directory, Ad Accounts and
                  Team pages. Nothing selected = the main book (default). Admins with
                  the Admin Management permission and supers always see every book.
                  A selection WITHOUT the main book makes this an external partner
                  account — Payout DB, Welcome Kit and SOPs are hidden.
                </p>
              </fieldset>
            )}

            {/* Permissions */}
            <fieldset className="grid min-w-0 gap-2">
              <legend className="mb-2 text-sm font-medium leading-none">Module Permissions</legend>
              <PermissionToggleList
                permissions={permissions}
                onChange={handlePermChange}
                disabled={admin?.isSuper}
              />
              {admin?.isSuper && (
                <p className="text-xs text-muted-foreground">
                  Super admins always have full access to all modules.
                </p>
              )}
            </fieldset>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || (!isEdit && !username.trim())}>
              {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Admin"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
