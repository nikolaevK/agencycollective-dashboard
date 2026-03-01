"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useTransition, useRef } from "react";
import {
  Trash2, Upload, X, UserPlus, ShieldCheck, ShieldOff,
  Pencil, Save, XCircle,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  createUserAction,
  updateUserAction,
  removeUserLogoAction,
  deleteUserAction,
} from "@/app/actions/users";
import { checkUserAction } from "@/app/actions/auth";

interface UserPublic {
  id: string;
  accountId: string;
  displayName: string;
  logoPath: string | null;
}

const INPUT_CLS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

async function fetchUsers(): Promise<UserPublic[]> {
  const res = await fetch("/api/admin/users");
  const json = await res.json();
  return json.data as UserPublic[];
}

// ---- Password status badge ----
function PasswordStatus({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["user-password-status", userId],
    queryFn: () => checkUserAction(userId),
    staleTime: 30_000,
  });

  if (!data) return <div className="h-5 w-16 animate-pulse rounded bg-muted" />;

  return data.hasPassword ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
      <ShieldCheck className="h-3 w-3" /> Set
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      <ShieldOff className="h-3 w-3" /> Pending
    </span>
  );
}

// ---- Inline edit row ----
function EditRow({
  user,
  onDone,
}: {
  user: UserPublic;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const { theme } = useTheme();
  const logoStyle = theme === "dark" ? { filter: "invert(1)" } : undefined;
  const [accountId, setAccountId] = useState(user.accountId.replace(/^act_/, ""));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(user.logoPath);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Logo must be under 2 MB."); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setRemoveLogo(false);
    setError(null);
  }

  function handleClearLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    setRemoveLogo(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      // Remove logo if flagged
      if (removeLogo && user.logoPath) {
        const r = await removeUserLogoAction(user.id);
        if (r.error) { setError(r.error); return; }
      }

      // Update account ID and/or logo
      const fd = new FormData();
      fd.append("id", user.id);
      fd.append("accountId", accountId.trim());
      if (logoFile) fd.append("logo", logoFile);

      const result = await updateUserAction(fd);
      if (result.error) { setError(result.error); return; }

      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      onDone();
    });
  }

  return (
    <tr className="bg-muted/30 border-b">
      <td colSpan={6} className="px-3 py-4">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Editing: <span className="text-foreground">{user.displayName}</span>
            {" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{user.id}</code>
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Account ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Meta Account ID</label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="e.g. 1572583670559433"
                className={INPUT_CLS}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">The numeric Meta Ads account ID (act_ prefix optional).</p>
            </div>

            {/* Logo */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Brand Logo</label>
              {logoPreview ? (
                <div className="flex items-center gap-3">
                  <img
                    src={logoPreview}
                    alt="Logo"
                    className="h-12 w-20 rounded-md border border-border object-contain bg-muted/30 p-1 transition-[filter] duration-200"
                    style={logoStyle}
                  />
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`logo-edit-${user.id}`}
                      className="flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Upload className="h-3 w-3" /> Replace
                      <input
                        id={`logo-edit-${user.id}`}
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,.svg"
                        onChange={handleLogoSelect}
                        ref={fileInputRef}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleClearLogo}
                      className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <X className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor={`logo-edit-${user.id}`}
                  className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Upload logo</span>
                  <input
                    id={`logo-edit-${user.id}`}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.svg"
                    onChange={handleLogoSelect}
                    ref={fileInputRef}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              {isPending ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={onDone}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-50 transition-colors"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ---- Main page ----
export default function UsersPage() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const logoStyle = theme === "dark" ? { filter: "invert(1)" } : undefined;
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsers,
    staleTime: 0,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPendingDelete, startDeleteTransition] = useTransition();

  // Create form state
  const [isPendingCreate, startCreateTransition] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setCreateError("Logo must be under 2 MB."); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setCreateError(null);
  }

  function clearLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    const fd = new FormData(e.currentTarget);
    if (logoFile) fd.set("logo", logoFile);

    startCreateTransition(async () => {
      const result = await createUserAction(fd);
      if (result.error) {
        setCreateError(result.error);
        return;
      }
      createFormRef.current?.reset();
      clearLogo();
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    });
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteUserAction(id);
      if (result.error) {
        setDeleteError(result.error);
      } else {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      }
      setDeletingId(null);
    });
  }

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage client portal accounts. Clients use their User ID to log in and set their own password.
          </p>
        </div>

        {/* User list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Client Accounts
              {users && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({users.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deleteError && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                <p className="text-sm text-destructive">{deleteError}</p>
              </div>
            )}
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : !users || users.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No users yet. Create the first one below.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Logo</th>
                      <th className="pb-2 pr-3 font-medium">Display Name</th>
                      <th className="pb-2 pr-3 font-medium">User ID</th>
                      <th className="pb-2 pr-3 font-medium hidden sm:table-cell">Account ID</th>
                      <th className="pb-2 pr-3 font-medium">Password</th>
                      <th className="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <>
                        <tr
                          key={user.id}
                          className={
                            editingId === user.id
                              ? "border-t-2 border-primary/30 bg-primary/5"
                              : "border-b last:border-0 align-middle"
                          }
                        >
                          <td className="py-3 pr-3">
                            {user.logoPath ? (
                              <img
                                src={user.logoPath}
                                alt={user.displayName}
                                className="h-8 w-8 rounded-md object-contain border border-border bg-muted/30 transition-[filter] duration-200"
                                style={logoStyle}
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-md border border-border bg-muted/30 flex items-center justify-center text-[10px] text-muted-foreground font-bold">
                                {user.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-3 font-medium">{user.displayName}</td>
                          <td className="py-3 pr-3">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                              {user.id}
                            </code>
                          </td>
                          <td className="py-3 pr-3 hidden sm:table-cell">
                            <code className="text-xs text-muted-foreground font-mono">
                              {user.accountId}
                            </code>
                          </td>
                          <td className="py-3 pr-3">
                            <PasswordStatus userId={user.id} />
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() =>
                                  setEditingId(editingId === user.id ? null : user.id)
                                }
                                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                title={editingId === user.id ? "Close editor" : "Edit user"}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">
                                  {editingId === user.id ? "Close" : "Edit"}
                                </span>
                              </button>
                              <button
                                onClick={() => handleDelete(user.id)}
                                disabled={isPendingDelete && deletingId === user.id}
                                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                                title="Remove user"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Remove</span>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {editingId === user.id && (
                          <EditRow
                            key={`edit-${user.id}`}
                            user={user}
                            onDone={() => setEditingId(null)}
                          />
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create user form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Create New User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form ref={createFormRef} onSubmit={handleCreate} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Display Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Display Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    name="displayName"
                    placeholder="e.g. Inner Glow Beauty"
                    required
                    className={INPUT_CLS}
                  />
                  <p className="text-xs text-muted-foreground">Shown in the client's portal header.</p>
                </div>

                {/* User ID */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    User ID <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    name="id"
                    placeholder="e.g. InnerGlow"
                    required
                    className={INPUT_CLS}
                  />
                  <p className="text-xs text-muted-foreground">
                    Share this with the client — they use it to log in.
                  </p>
                </div>

                {/* Account ID */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Meta Account ID <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    name="accountId"
                    placeholder="e.g. 1572583670559433"
                    required
                    className={INPUT_CLS}
                  />
                  <p className="text-xs text-muted-foreground">
                    The numeric Meta Ads account ID (act_ prefix optional).
                  </p>
                </div>

                {/* Brand Logo */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Brand Logo</label>
                  {logoPreview ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="h-12 w-20 rounded-md border border-border object-contain bg-muted/30 p-1 transition-[filter] duration-200"
                        style={logoStyle}
                      />
                      <button
                        type="button"
                        onClick={clearLogo}
                        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3 w-3" /> Remove
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="logo-create"
                      className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Click to upload (PNG, JPG, SVG — max 2 MB)
                      </span>
                      <input
                        id="logo-create"
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,.svg"
                        onChange={handleLogoSelect}
                        ref={fileInputRef}
                        className="sr-only"
                      />
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Displayed in the client's portal sidebar. Optional.
                  </p>
                </div>
              </div>

              {createError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
                  <p className="text-sm text-destructive">{createError}</p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isPendingCreate}
                  className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  {isPendingCreate ? "Creating..." : "Create User"}
                </button>
                <p className="text-xs text-muted-foreground">
                  The client sets their own password on first login.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
