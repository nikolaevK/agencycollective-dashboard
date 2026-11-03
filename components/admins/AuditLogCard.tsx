"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, LogIn, UserPlus, UserCog, Trash2, ShieldCheck } from "lucide-react";
import type { AuditLogEntry } from "@/lib/auditLog";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ACTION_CONFIG: Record<string, { icon: typeof Clock; label: string; destructive?: boolean }> = {
  "admin.login": { icon: LogIn, label: "Logged in" },
  "admin.create": { icon: UserPlus, label: "Created admin" },
  "admin.update": { icon: UserCog, label: "Updated admin" },
  "admin.delete": { icon: Trash2, label: "Deleted admin", destructive: true },
  "admin.permissions_changed": { icon: ShieldCheck, label: "Changed permissions" },
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr + "Z"); // UTC
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  const res = await fetch("/api/admin/audit-log");
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

export function AuditLogCard() {
  const { data: logs = [] } = useQuery({
    queryKey: ["audit-log"],
    queryFn: fetchAuditLogs,
    refetchInterval: 30_000,
  });

  const recentLogs = logs.slice(0, 10);

  return (
    <Card>
      <CardHeader className="border-b pb-3 md:pb-3">
        <CardTitle className="text-sm">Recent Activity</CardTitle>
      </CardHeader>
      <div className="divide-y">
        {recentLogs.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground md:px-6">No activity recorded yet.</p>
        )}
        {recentLogs.map((log) => {
          const config = ACTION_CONFIG[log.action] ?? {
            icon: Clock,
            label: log.action,
          };
          const Icon = config.icon;

          return (
            <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 md:px-6">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon
                  className={cn(
                    "size-3.5",
                    config.destructive ? "text-destructive" : "text-muted-foreground"
                  )}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs break-words">
                  <span className="font-medium">{log.adminUsername}</span>
                  {" "}
                  <span className="text-muted-foreground">{config.label}</span>
                  {log.targetId && log.targetId !== log.adminId && (
                    <>
                      {" "}
                      <span className="font-medium">{log.targetId}</span>
                    </>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatRelativeTime(log.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
