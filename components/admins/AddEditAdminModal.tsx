"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AdminAvatarUpload } from "./AdminAvatarUpload";
import { PermissionToggleList } from "./PermissionToggleList";
import { ADMIN_ROLE_OPTIONS, type AdminPublic } from "./types";
import type { AdminPermissions, PermissionKey } from "@/lib/permissions";
import { allPermissionsFalse } from "@/lib/permissions";
import { getInitials } from "@/lib/utils";

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

  const INPUT_CLS =
    "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

  return (
    <div className="fixed inset-0 z-[60] hidden md:flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-semibold">{isEdit ? "Edit Admin" : "Add Admin"}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Avatar */}
          <AdminAvatarUpload
            currentPath={admin?.avatarPath ?? null}
            initials={getInitials(displayName, username)}
            onFileSelect={handleFileSelect}
            previewUrl={avatarPreview}
          />

          {/* Username (create only) */}
          {!isEdit && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. john"
                required
                className={INPUT_CLS}
              />
              <p className="text-xs text-muted-foreground">
                Used for login. Cannot be changed after creation.
              </p>
            </div>
          )}

          {/* Display Name + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="John Doe"
                className={INPUT_CLS}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className={INPUT_CLS}
              />
            </div>
          </div>

          {/* Role — a label, not a permission preset: CSM/Media Buyer keep
              whatever module toggles are set below. */}
          {!admin?.isSuper && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={INPUT_CLS}
              >
                {ADMIN_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                {/* Legacy free-text role — keep it selectable so editing other
                    fields doesn't silently clobber it. */}
                {!ADMIN_ROLE_OPTIONS.some((o) => o.value === role) && (
                  <option value={role}>{role}</option>
                )}
              </select>
              <p className="text-xs text-muted-foreground">
                A label shown across the dashboard — module permissions are set below.
              </p>
            </div>
          )}

          {/* Workspaces (books) — which Client Directory / Team books this
              admin sees. Only shown when partner workspaces exist. */}
          {!admin?.isSuper && registry.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Client Directory Workspaces</label>
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                {registry.map((w) => (
                  <label key={w.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={workspaceSel.includes(w.value)}
                      onChange={(e) =>
                        setWorkspaceSel((prev) =>
                          e.target.checked
                            ? [...prev, w.value]
                            : prev.filter((v) => v !== w.value)
                        )
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    <span>{w.label}</span>
                    {w.builtIn && (
                      <span className="text-xs text-muted-foreground">(main book)</span>
                    )}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Which books this admin sees in the Client Directory, Ad Accounts and
                Team pages. Nothing selected = the main book (default). Admins with
                the Admin Management permission and supers always see every book.
                A selection WITHOUT the main book makes this an external partner
                account — Payout DB, Welcome Kit and SOPs are hidden.
              </p>
            </div>
          )}

          {/* Permissions */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Module Permissions</label>
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
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || (!isEdit && !username.trim())}
              className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Admin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
