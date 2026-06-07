"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Upload,
  Trash2,
  Pencil,
  Sparkles,
  FolderPlus,
  FolderInput,
  Palette,
  Star,
  CheckCircle2,
  ChevronDown,
  Eraser,
  X,
  Activity as ActivityIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityEntry {
  id: number;
  adminId: string;
  adminUsername: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

const ACTION_META: Record<string, { label: string; icon: typeof Upload; tone: string }> = {
  "media_document.upload": { label: "uploaded", icon: Upload, tone: "text-emerald-500" },
  "media_document.generated": { label: "generated", icon: Sparkles, tone: "text-primary" },
  "media_document.edit": { label: "edited", icon: Pencil, tone: "text-amber-500" },
  "media_document.delete": { label: "deleted", icon: Trash2, tone: "text-destructive" },
  "media_document.important": { label: "flagged important", icon: Star, tone: "text-amber-500" },
  "media_document.read": { label: "read", icon: CheckCircle2, tone: "text-emerald-500" },
  "media_folder.create": { label: "created folder", icon: FolderPlus, tone: "text-emerald-500" },
  "media_folder.rename": { label: "renamed folder", icon: FolderInput, tone: "text-amber-500" },
  "media_folder.recolor": { label: "recolored folder", icon: Palette, tone: "text-violet-500" },
  "media_folder.important": { label: "flagged folder important", icon: Star, tone: "text-amber-500" },
  "media_folder.delete": { label: "deleted folder", icon: Trash2, tone: "text-destructive" },
  "media_activity.clear": { label: "cleared activity", icon: Eraser, tone: "text-destructive" },
};

const CLEAR_OPTIONS: { label: string; params: string; all?: boolean }[] = [
  { label: "Older than 90 days", params: "olderThanDays=90" },
  { label: "Older than 30 days", params: "olderThanDays=30" },
  { label: "Older than 7 days", params: "olderThanDays=7" },
  { label: "All activity", params: "all=1", all: true },
];

function formatTimestamp(raw: string): string {
  // SQLite datetime('now') is zone-less UTC — normalize to an explicit instant.
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseSubject(details: string | null): string | null {
  if (!details) return null;
  try {
    const obj = JSON.parse(details);
    if (typeof obj.fileName === "string") return obj.fileName;
    if (typeof obj.from === "string" && typeof obj.to === "string") return `${obj.from} → ${obj.to}`;
    if (typeof obj.name === "string") return obj.name;
    return null;
  } catch {
    return null;
  }
}

export function MediaActivityFeed({ isManager }: { isManager: boolean }) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<(typeof CLEAR_OPTIONS)[number] | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  const { data: entries = [], isLoading } = useQuery<ActivityEntry[]>({
    queryKey: ["media-activity"],
    queryFn: async () => {
      const res = await fetch("/api/admin/media-buyers/activity?limit=100");
      if (!res.ok) throw new Error("Failed to load activity");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 15_000,
  });

  // Escape closes the open menu or the confirm dialog (when not mid-clear).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (clearing) return;
      if (pending) setPending(null);
      else if (menuOpen) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, menuOpen, clearing]);

  async function runClear() {
    if (!pending) return;
    setClearing(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/media-buyers/activity?${pending.params}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Could not clear activity");
      } else {
        setPending(null);
        queryClient.invalidateQueries({ queryKey: ["media-activity"] });
      }
    } catch {
      setError("Could not clear activity");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header with manager-only clear control */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        {isManager && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", menuOpen && "rotate-180")} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-popover py-1 shadow-lg">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Clear activity
                  </p>
                  {CLEAR_OPTIONS.map((o) => (
                    <button
                      key={o.params}
                      onClick={() => { setMenuOpen(false); setError(""); setPending(o); }}
                      className={cn(
                        "block w-full px-3 py-2 text-left text-sm hover:bg-accent",
                        o.all ? "text-destructive" : "text-foreground"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card p-10 text-center">
          <ActivityIcon className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No activity yet. Uploads, edits, deletions, and AI-generated documents will appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <ul className="divide-y divide-border/50">
            {entries.map((entry) => {
              const meta = ACTION_META[entry.action] ?? {
                label: entry.action,
                icon: ActivityIcon,
                tone: "text-muted-foreground",
              };
              const Icon = meta.icon;
              const subject = parseSubject(entry.details);
              return (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted", meta.tone)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{entry.adminUsername}</span>{" "}
                      <span className="text-muted-foreground">{meta.label}</span>
                      {subject && <span className="font-medium"> {subject}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatTimestamp(entry.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Confirm clear */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !clearing && setPending(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Clear activity</h3>
              <button onClick={() => !clearing && setPending(null)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {pending.all
                ? "Permanently remove all media-buyer activity entries?"
                : `Permanently remove activity entries ${pending.label.toLowerCase()}?`}{" "}
              This cannot be undone.
            </p>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setPending(null)}
                disabled={clearing}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={runClear}
                disabled={clearing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
