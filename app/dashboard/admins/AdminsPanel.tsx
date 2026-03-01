"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, ShieldCheck, Shield } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";

interface AdminPublic {
  id: string;
  username: string;
  passwordHash: null; // never sent to client
  isSuper: boolean;
  hasPassword: boolean;
}

async function fetchAdmins(): Promise<AdminPublic[]> {
  const res = await fetch("/api/admin/admins");
  if (!res.ok) throw new Error("Failed to fetch admins");
  const json = await res.json();
  return json.data;
}

const INPUT_CLS =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-shadow";

export function AdminsPanel() {
  const queryClient = useQueryClient();
  const { data: admins = [], isLoading } = useQuery({
    queryKey: ["admins"],
    queryFn: fetchAdmins,
  });

  const [newUsername, setNewUsername] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const username = newUsername.trim().toLowerCase();
    if (!username) return;

    startTransition(async () => {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error ?? "Failed to create admin");
        return;
      }
      setNewUsername("");
      queryClient.invalidateQueries({ queryKey: ["admins"] });
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await fetch(`/api/admin/admins?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["admins"] });
    });
  }

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Admin Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage admin accounts. New admins set their own password on first sign-in.
          </p>
        </div>

        {/* Admin list */}
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Username</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Password</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && admins.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    No admins found.
                  </td>
                </tr>
              )}
              {admins.map((admin) => (
                <tr key={admin.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{admin.username}</td>
                  <td className="px-4 py-3">
                    {admin.isSuper ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <ShieldCheck className="h-3 w-3" />
                        Super Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        <Shield className="h-3 w-3" />
                        Admin
                      </span>
                    )}
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
                  <td className="px-4 py-3 text-right">
                    {!admin.isSuper && (
                      <button
                        onClick={() => handleDelete(admin.id)}
                        disabled={isPending}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                        title="Delete admin"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Create new admin */}
        <div className="rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold mb-3">Add Admin</h2>
          <form onSubmit={handleCreate} className="flex items-start gap-3">
            <div className="flex-1 space-y-1.5">
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Username (e.g. john)"
                required
                className={INPUT_CLS}
              />
              <p className="text-xs text-muted-foreground">
                The new admin will create their password on first sign-in at{" "}
                <span className="font-mono">/admin/login</span>.
              </p>
              {formError && (
                <p className="text-xs text-destructive">{formError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={isPending || !newUsername.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add Admin
            </button>
          </form>
        </div>
      </div>
    </DashboardShell>
  );
}
