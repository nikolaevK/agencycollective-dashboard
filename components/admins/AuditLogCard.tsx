"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, LogIn, UserPlus, UserCog, Trash2, ShieldCheck } from "lucide-react";
import type { AuditLogEntry } from "@/lib/auditLog";

const ACTION_CONFIG: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  "admin.login": { icon: LogIn, label: "Logged in", color: "text-blue-500" },
  "admin.create": { icon: UserPlus, label: "Created admin", color: "text-green-500" },
  "admin.update": { icon: UserCog, label: "Updated admin", color: "text-amber-500" },
  "admin.delete": { icon: Trash2, label: "Deleted admin", color: "text-red-500" },
  "admin.permissions_changed": { icon: ShieldCheck, label: "Changed permissions", color: "text-primary" },
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
    <div className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Recent Activity</h3>
      </div>
      <div className="divide-y divide-border">
        {recentLogs.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">No activity recorded yet.</p>
        )}
        {recentLogs.map((log) => {
          const config = ACTION_CONFIG[log.action] ?? {
            icon: Clock,
            label: log.action,
            color: "text-muted-foreground",
          };
          const Icon = config.icon;

          return (
            <div key={log.id} className="flex items-start gap-3 px-4 py-2.5">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
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
                <p className="text-[10px] text-muted-foreground">{formatRelativeTime(log.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
