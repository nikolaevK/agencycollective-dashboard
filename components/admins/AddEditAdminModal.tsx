"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { AdminAvatarUpload } from "./AdminAvatarUpload";
import { PermissionToggleList } from "./PermissionToggleList";
import type { AdminPublic } from "./types";
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
    avatarFile?: File;
  }) => void;
  isPending: boolean;
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

  useEffect(() => {
    if (open) {
      if (admin) {
        setUsername(admin.username);
        setDisplayName(admin.displayName ?? "");
        setEmail(admin.email ?? "");
        setRole(admin.role);
        setPermissions({ ...admin.permissions });
      } else {
        setUsername("");
        setDisplayName("");
        setEmail("");
        setRole("admin");
        setPermissions(allPermissionsFalse());
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
      avatarFile,
    });
  }

  const INPUT_CLS =
    "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

  return (
    <div className="fixed inset-0 z-50 hidden md:flex items-center justify-center">
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
