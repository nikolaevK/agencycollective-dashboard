"use client";

import { useState, useEffect, useId } from "react";
import { ArrowLeft } from "lucide-react";
import { AdminAvatarUpload } from "./AdminAvatarUpload";
import { AdminRoleSelect } from "./AdminRoleSelect";
import { PermissionToggleList } from "./PermissionToggleList";
import type { AdminPublic } from "./types";
import type { AdminPermissions, PermissionKey } from "@/lib/permissions";
import { allPermissionsFalse } from "@/lib/permissions";
import { getInitials } from "@/lib/utils";
import { useDialogFocus } from "./useDialogFocus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const uid = useId();

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

  const focus = useDialogFocus<HTMLDivElement>();

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

  const titleId = `${uid}-title`;
  // Name the admin being edited, so the form can't be mistaken for another's.
  const title = admin ? `Edit ${admin.displayName || admin.username}` : "Add Admin";

  return (
    <div
      ref={focus.ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={focus.onKeyDown}
      className="fixed inset-0 z-[60] flex flex-col bg-background outline-none md:hidden"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <h2 id={titleId} className="truncate text-base font-medium">
            {title}
          </h2>
        </div>
        <Button
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
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <form
          onSubmit={handleSubmit}
          className="space-y-6 px-4 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))]"
        >
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
                // A login name: no phone auto-capitalize / autocorrect.
                autoCapitalize="none"
                autoCorrect="off"
                required
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Used for login. Cannot be changed after creation.
              </p>
            </div>
          )}

          {/* Display Name */}
          <div className="grid gap-2">
            <Label htmlFor={`${uid}-display`}>Display Name</Label>
            <Input
              id={`${uid}-display`}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="John Doe"
              className="h-11"
            />
          </div>

          {/* Email */}
          <div className="grid gap-2">
            <Label htmlFor={`${uid}-email`}>Email</Label>
            <Input
              id={`${uid}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              className="h-11"
            />
          </div>

          {/* Role — a label, not a permission preset: CSM/Media Buyer keep
              whatever module toggles are set below. */}
          {!admin?.isSuper && (
            <div className="grid gap-2">
              <Label htmlFor={`${uid}-role`}>Role</Label>
              <AdminRoleSelect id={`${uid}-role`} value={role} onChange={setRole} className="h-11" />
              <p className="text-xs text-muted-foreground">
                A label shown across the dashboard — module permissions are set below.
              </p>
            </div>
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
        </form>
      </div>
    </div>
  );
}
