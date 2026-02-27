"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, ExternalLink, Trash2, UserPlus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SettingsResponse } from "@/app/api/settings/route";

interface UserRecord {
  id: string;
  accountId: string;
  displayName: string;
}

async function fetchSettings(): Promise<SettingsResponse> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: "Active",
  2: "Disabled",
  3: "Unsettled",
  7: "Pending Review",
  9: "In Grace Period",
  100: "Disabled",
  101: "Closed",
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
    staleTime: 5 * 60 * 1000,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetch("/api/admin/users").then((r) => r.json()).then((j) => j.data as UserRecord[]),
    staleTime: 0,
  });

  const [newUserId, setNewUserId] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  const [instructionsOpen, setInstructionsOpen] = useState(
    !data?.tokenConfigured
  );

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAddLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newUserId, accountId: newAccountId, displayName: newDisplayName }),
      });
      if (!res.ok) {
        const json = await res.json();
        setAddError(json.error ?? "Failed to add user");
      } else {
        setNewUserId("");
        setNewDisplayName("");
        setNewAccountId("");
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      }
    } catch {
      setAddError("Network error");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemoveUser(id: string) {
    await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }

  // Expand instructions once we know token is not configured
  const showExpanded = !data?.tokenConfigured || instructionsOpen;

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your Meta Ads integration
          </p>
        </div>

        {/* Token Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">API Token Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            ) : data?.tokenConfigured ? (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium">Configured</span>
                <code className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {data.tokenMasked}
                </code>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-700">
                <XCircle className="h-5 w-5 text-red-500" />
                <span className="font-medium">Not configured</span>
                {data?.tokenMasked && (
                  <code className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {data.tokenMasked}
                  </code>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Setup Instructions */}
        <Card>
          <CardHeader>
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setInstructionsOpen((o) => !o)}
            >
              <CardTitle className="text-base">Setup Instructions</CardTitle>
              {showExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showExpanded && (
            <CardContent>
              <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside">
                <li>
                  Go to{" "}
                  <a
                    href="https://developers.facebook.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
                  >
                    developers.facebook.com
                    <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  and create or open a Business App.
                </li>
                <li>
                  Add <code className="rounded bg-muted px-1 py-0.5">ads_read</code> permission
                  (and <code className="rounded bg-muted px-1 py-0.5">ads_management</code> for write access).
                </li>
                <li>
                  Generate a long-lived token via a System User in Business Manager,
                  or use a User token from the Graph API Explorer.
                </li>
                <li>
                  Set{" "}
                  <code className="rounded bg-muted px-1 py-0.5">META_ACCESS_TOKEN=&lt;token&gt;</code>{" "}
                  in <code className="rounded bg-muted px-1 py-0.5">.env.local</code> and restart
                  the dev server.
                </li>
              </ol>
            </CardContent>
          )}
        </Card>

        {/* API Efficiency */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">API Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Using <strong className="text-foreground">Meta Batch API</strong> — fetches
              insights for up to 50 accounts per HTTP request, reducing network overhead
              significantly compared to individual per-account requests.
            </p>
          </CardContent>
        </Card>

        {/* Connected Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Connected Accounts
              {data?.accountCount != null && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({data.accountCount})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-8 w-full animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : !data?.tokenConfigured ? (
              <p className="text-sm text-muted-foreground">
                Configure your token above to see connected accounts.
              </p>
            ) : data.accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No ad accounts found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">ID</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((account) => (
                    <tr key={account.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{account.name}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {account.id}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={account.status === 1 ? "default" : "secondary"}
                          className={
                            account.status === 1
                              ? "bg-green-100 text-green-800 hover:bg-green-100"
                              : "bg-gray-100 text-gray-600"
                          }
                        >
                          {ACCOUNT_STATUS_LABELS[account.status] ?? `Status ${account.status}`}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted-foreground">{account.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        {/* Manage Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {usersLoading ? (
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            ) : !usersData || usersData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet. Add one below.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Display Name</th>
                    <th className="pb-2 pr-4 font-medium">User ID</th>
                    <th className="pb-2 pr-4 font-medium">Account ID</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {usersData.map((user) => (
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{user.displayName}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{user.id}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{user.accountId}</td>
                      <td className="py-2">
                        <button
                          onClick={() => handleRemoveUser(user.id)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
                          title="Remove user"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Add user form */}
            <form onSubmit={handleAddUser} className="flex flex-col gap-3 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add User</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="User ID"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  required
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  type="text"
                  placeholder="Display Name"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  required
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  type="text"
                  placeholder="Account Number"
                  value={newAccountId}
                  onChange={(e) => setNewAccountId(e.target.value)}
                  required
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              {addError && (
                <p className="text-sm text-red-600">{addError}</p>
              )}
              <button
                type="submit"
                disabled={addLoading}
                className="flex items-center justify-center gap-2 self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {addLoading ? "Adding..." : "Add User"}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
