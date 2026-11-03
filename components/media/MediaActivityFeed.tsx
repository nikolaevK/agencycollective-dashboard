"use client";

import { Fragment, useState, useEffect, useId, useRef } from "react";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/shared/QueryErrorState";

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

// Icons stay neutral (no colored tiles); only removals read as destructive.
const ACTION_META: Record<string, { label: string; icon: typeof Upload; destructive?: boolean }> = {
  "media_document.upload": { label: "uploaded", icon: Upload },
  "media_document.generated": { label: "generated", icon: Sparkles },
  "media_document.edit": { label: "edited", icon: Pencil },
  "media_document.delete": { label: "deleted", icon: Trash2, destructive: true },
  "media_document.important": { label: "flagged important", icon: Star },
  "media_document.read": { label: "read", icon: CheckCircle2 },
  "media_folder.create": { label: "created folder", icon: FolderPlus },
  "media_folder.rename": { label: "renamed folder", icon: FolderInput },
  "media_folder.recolor": { label: "recolored folder", icon: Palette },
  "media_folder.important": { label: "flagged folder important", icon: Star },
  "media_folder.delete": { label: "deleted folder", icon: Trash2, destructive: true },
  "media_activity.clear": { label: "cleared activity", icon: Eraser, destructive: true },
};

const CLEAR_OPTIONS: { label: string; params: string; all?: boolean }[] = [
  { label: "Older than 90 days", params: "olderThanDays=90" },
  { label: "Older than 30 days", params: "olderThanDays=30" },
  { label: "Older than 7 days", params: "olderThanDays=7" },
  { label: "All activity", params: "all=1", all: true },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

function ActivitySkeleton() {
  return (
    <ul className="divide-y" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3 md:px-6">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: `${[60, 45, 70, 50, 65, 40][i]}%` }} />
          <Skeleton className="ml-auto h-3 w-24 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

export function MediaActivityFeed({ isManager }: { isManager: boolean }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<(typeof CLEAR_OPTIONS)[number] | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const headingId = useId();
  // A pick opens the confirm — keep focus there instead of handing it back
  // to the menu trigger. The confirm hands it back itself when it closes.
  const pickedRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: entries = [], isLoading, isError, refetch } = useQuery<ActivityEntry[]>({
    queryKey: ["media-activity"],
    queryFn: async () => {
      const res = await fetch("/api/admin/media-buyers/activity?limit=100");
      if (!res.ok) throw new Error("Failed to load activity");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 15_000,
  });

  // Escape closes the confirm dialog (when not mid-clear). The Clear menu
  // handles its own Escape. Tab wraps inside the dialog (focus that slipped
  // out — e.g. off a button disabled mid-clear — is pulled back in).
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!clearing) setPending(null);
        return;
      }
      const panel = panelRef.current;
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0
      );
      const active = document.activeElement;
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, clearing]);

  // Closing the confirm (cancel, Escape, overlay, or a finished clear) puts
  // focus back on the Clear button that opened it.
  const confirmOpen = pending !== null;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (confirmOpen) wasOpen.current = true;
    else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [confirmOpen]);

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

  if (isError && entries.length === 0) {
    return <QueryErrorState title="Couldn't load activity" onRetry={() => refetch()} />;
  }

  return (
    <>
      <Card>
        {/* Header with manager-only clear control */}
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3 md:px-6">
          <div className="min-w-0">
            <h3 className="text-base font-medium leading-snug text-foreground">Activity</h3>
            <p className="text-xs text-muted-foreground">The latest 100 document and folder changes across the team.</p>
          </div>
          {isManager && (
            // modal={false}: a pick opens the confirm dialog; a modal menu
            // closing underneath it can leave <body> pointer-events stuck.
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button ref={triggerRef} type="button" variant="outline" size="sm" className="group/clear shrink-0">
                  <Eraser />
                  Clear
                  <ChevronDown className="transition-transform group-data-[state=open]/clear:rotate-180" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(e) => {
                  if (pickedRef.current) {
                    pickedRef.current = false;
                    e.preventDefault();
                  }
                }}
              >
                <DropdownMenuLabel className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Clear activity
                </DropdownMenuLabel>
                {CLEAR_OPTIONS.map((o) => (
                  <Fragment key={o.params}>
                    {o.all && <DropdownMenuSeparator />}
                    <DropdownMenuItem
                      variant={o.all ? "destructive" : "default"}
                      onSelect={() => { pickedRef.current = true; setError(""); setPending(o); }}
                    >
                      {o.label}
                    </DropdownMenuItem>
                  </Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Body */}
        {isLoading ? (
          <ActivitySkeleton />
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <ActivityIcon className="size-8 text-muted-foreground/50" />
            <p className="max-w-sm text-sm text-muted-foreground">
              No activity yet. Uploads, edits, deletions, and AI-generated documents will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => {
              const meta = ACTION_META[entry.action] ?? {
                label: entry.action,
                icon: ActivityIcon,
              };
              const Icon = meta.icon;
              const subject = parseSubject(entry.details);
              return (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3 md:px-6">
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted",
                      meta.destructive ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <p className="min-w-0 flex-1 break-words text-sm text-foreground">
                    <span className="font-medium">{entry.adminUsername}</span>{" "}
                    <span className="text-muted-foreground">{meta.label}</span>
                    {subject && <span className="font-medium"> {subject}</span>}
                  </p>
                  <time dateTime={entry.createdAt} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatTimestamp(entry.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Confirm clear — hand-built: it stays open (and can't be dismissed)
          while clearing, and shows a failure inline. */}
      {pending && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className={dialogOverlayClass} onClick={() => !clearing && setPending(null)} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            tabIndex={-1}
            className={cn(dialogPanelClass, "relative z-50 w-full max-w-sm space-y-4 p-6 outline-none")}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 id={headingId} className="text-base font-medium leading-none text-foreground">
                Clear activity
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => !clearing && setPending(null)}
                className="-mr-2 -mt-2 shrink-0 bg-secondary"
                aria-label="Close"
              >
                <X />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {pending.all
                ? "Permanently remove all media-buyer activity entries?"
                : `Permanently remove activity entries ${pending.label.toLowerCase()}?`}{" "}
              This cannot be undone.
            </p>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setPending(null)} disabled={clearing} autoFocus>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={runClear}
                disabled={clearing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {clearing ? <Loader2 className="animate-spin" /> : <Eraser />}
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
