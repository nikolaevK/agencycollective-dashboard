"use client";

import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { AdminAvatarUpload } from "./AdminAvatarUpload";
import { PermissionToggleList } from "./PermissionToggleList";
import type { AdminPublic } from "./types";
import type { AdminPermissions, PermissionKey } from "@/lib/permissions";
import { allPermissionsFalse } from "@/lib/permissions";
import { getInitials } from "@/lib/utils";

interface AddEditAdminMobileProps {
  open: boolean;
  admin: AdminPublic | null;
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

export function AddEditAdminMobile({ open, admin, onClose, onSave, isPending }: AddEditAdminMobileProps) {
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
    "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

  return (
    <div className="fixed inset-0 z-50 md:hidden bg-background overflow-y-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-base font-semibold">{isEdit ? "Edit Admin" : "Add Admin"}</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            onSave({
              id: admin?.id,
              username: isEdit ? undefined : username.trim().toLowerCase(),
              displayName: displayName.trim(),
              email: email.trim(),
              role,
              permissions,
              avatarFile,
            });
          }}
          disabled={isPending || (!isEdit && !username.trim())}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 pb-24 space-y-6">
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

        {/* Display Name */}
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

        {/* Email */}
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
      </form>
    </div>
  );
}
