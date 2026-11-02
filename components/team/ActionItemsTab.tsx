"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Link2, Plus, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/components/users/format";
import { Badge, StatusBadge, badgeToneHover } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/use-confirm";
import {
  useActionItemMutations,
  useTeamMemberOptions,
  type TeamMemberOption,
} from "./useTeamData";
import { SOURCE_META, TASK_STATUS_META } from "./presentation";
import type { MemberHubPayload, TeamActionItemRecord, TaskStatus } from "./types";

// Radix SelectItem can't hold "" — "No client" maps to this and back.
const NO_CLIENT = "__none__";

export function ActionItemsTab({
  hub,
  items,
  onOpenTask,
}: {
  hub: MemberHubPayload;
  items: TeamActionItemRecord[];
  onOpenTask: (id: string) => void;
}) {
  const { setItemStatus, reassignItem } = useActionItemMutations(hub.member.adminId);
  const { data: memberOptions = [] } = useTeamMemberOptions();
  const forwardTargets = memberOptions.filter(
    (m) => m.adminId !== hub.member.adminId
  );
  const [addOpen, setAddOpen] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  async function forward(item: TeamActionItemRecord, toAdminId: string) {
    const target = forwardTargets.find((m) => m.adminId === toAdminId);
    if (!target) return;
    if (
      !(await confirm({
        title: `Forward this action item to ${target.name}?`,
        description:
          "It moves to their inbox with full ownership (linked task included).",
        confirmText: "Forward",
      }))
    )
      return;
    reassignItem(item.id, toAdminId).catch((err) =>
      alert(err instanceof Error ? err.message : String(err))
    );
  }

  const unsolved = items.filter((i) => i.status === "unsolved");
  const solved = items.filter((i) => i.status === "solved");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-3xl bg-muted/40 px-4 py-3">
        <Zap className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-[14rem] flex-1 text-xs text-muted-foreground">
          Action items flagged in client Slack channels or dashboard threads are{" "}
          <span className="font-medium text-foreground">relayed here by the reporting agent</span>{" "}
          and automatically added to {hub.member.name}&apos;s task board. Solving one completes
          the linked task — and completing the task solves it.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAddOpen((o) => !o)}
          className="ml-auto"
        >
          <Plus />
          Add item
        </Button>
      </div>

      {addOpen && <AddItemForm hub={hub} onDone={() => setAddOpen(false)} />}

      {[...unsolved, ...solved].map((item) => (
        <ActionItemCard
          key={item.id}
          item={item}
          clientName={
            item.clientId
              ? hub.clients.find((c) => c.id === item.clientId)?.displayName ?? null
              : null
          }
          onFlip={(status) =>
            setItemStatus(item.id, status).catch((err) =>
              alert(err instanceof Error ? err.message : String(err))
            )
          }
          onOpenTask={onOpenTask}
          forwardTargets={forwardTargets}
          onForward={(toAdminId) => forward(item, toAdminId)}
        />
      ))}
      {items.length === 0 && (
        <p className="rounded-3xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          No action items — inbox zero
        </p>
      )}
      {confirmDialog}
    </div>
  );
}

function ActionItemCard({
  item,
  clientName,
  onFlip,
  onOpenTask,
  forwardTargets,
  onForward,
}: {
  item: TeamActionItemRecord;
  clientName: string | null;
  onFlip: (status: "solved" | "unsolved") => void;
  onOpenTask: (id: string) => void;
  forwardTargets: TeamMemberOption[];
  onForward: (toAdminId: string) => void;
}) {
  const src = SOURCE_META[item.sourceType];
  const SourceIcon = src.icon;
  const solved = item.status === "solved";
  const taskStatus = (item.linkedTask?.status ?? "todo") as TaskStatus;
  // A forward pick opens the confirm dialog — don't send focus back to the
  // menu trigger underneath it (same pattern as ClientActionsMenu).
  const pickedRef = useRef(false);

  return (
    <Card className={cn("p-4", solved && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="max-w-full font-normal text-muted-foreground">
          <SourceIcon />
          <span className="truncate">
            {src.label}
            {item.sourceChannel && ` · ${item.sourceChannel}`}
          </span>
        </Badge>
        {clientName && (
          <Badge
            variant="outline"
            className="block max-w-full truncate font-normal text-muted-foreground"
            title={clientName}
          >
            {clientName}
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {item.authorLabel && `${item.authorLabel} · `}
          {/* Agents may relay a non-ISO stamp (e.g. a Slack ts) — fall back. */}
          {formatDate(
            item.externalTs && !Number.isNaN(Date.parse(item.externalTs))
              ? item.externalTs
              : item.createdAt
          )}
        </span>
      </div>

      <p className="mt-2 break-words text-sm leading-relaxed text-foreground">
        {item.body}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.linkedTask && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenTask(item.linkedTask!.id)}
            // Long titles wrap instead of overflowing the pill.
            className="h-auto min-h-8 max-w-full justify-start whitespace-normal rounded-2xl py-1.5 text-left"
          >
            <Link2 className="text-muted-foreground" />
            <span className="min-w-0 break-words">
              <span className="text-muted-foreground">Linked task: </span>
              {item.linkedTask.title}
            </span>
            <StatusBadge tone={TASK_STATUS_META[taskStatus]?.tone ?? "neutral"}>
              {TASK_STATUS_META[taskStatus]?.label}
            </StatusBadge>
          </Button>
        )}
        {/* Sweep items (dedup-keyed) are per-member; the API rejects
            forwarding them. Agent-created 'system'-labeled items forward fine. */}
        {forwardTargets.length > 0 && item.dedupKey == null && (
          // modal={false}: a pick opens the confirm dialog; a modal menu
          // closing underneath it can leave <body> pointer-events stuck.
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                aria-label="Forward to another member"
                title="Moves this item (and its linked task) to the selected member's hub"
              >
                Forward to…
                <ChevronDown className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-w-72"
              onCloseAutoFocus={(e) => {
                if (pickedRef.current) {
                  pickedRef.current = false;
                  e.preventDefault();
                }
              }}
            >
              <DropdownMenuLabel>
                Moves this item (and its linked task) to the selected member&apos;s hub
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {forwardTargets.map((m) => (
                <DropdownMenuItem
                  key={m.adminId}
                  onSelect={() => {
                    pickedRef.current = true;
                    onForward(m.adminId);
                  }}
                >
                  <span className="min-w-0 truncate">
                    {m.name}
                    {m.position && (
                      <span className="text-muted-foreground"> — {m.position}</span>
                    )}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {solved ? (
          <span className="ml-auto inline-flex items-center gap-1.5">
            <StatusBadge tone="success">
              Solved
              {item.solvedBy === "task" && " (via task)"}
              {item.solvedBy === "system" && " (auto)"}
            </StatusBadge>
            <Button type="button" variant="ghost" size="xs" onClick={() => onFlip("unsolved")}>
              Reopen
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onFlip("solved")}
            className={cn("ml-auto", badgeToneHover.success)}
          >
            <Check />
            Mark Solved
          </Button>
        )}
      </div>
    </Card>
  );
}

function AddItemForm({ hub, onDone }: { hub: MemberHubPayload; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [clientId, setClientId] = useState("");
  const [channel, setChannel] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/team/members/${hub.member.adminId}/action-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: text,
            clientId: clientId || null,
            sourceType: "dashboard",
            sourceChannel: channel.trim() || null,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(json?.error ?? `HTTP ${res.status}`);
        return;
      }
      // The POST created an item AND a linked task — refresh both caches.
      queryClient.invalidateQueries({ queryKey: ["team-action-items", hub.member.adminId] });
      queryClient.invalidateQueries({ queryKey: ["team-tasks", hub.member.adminId] });
      queryClient.invalidateQueries({ queryKey: ["team-member", hub.member.adminId] });
      // The item's linked task counts in the weekly "created" lines.
      queryClient.invalidateQueries({ queryKey: ["team-member-trends", hub.member.adminId] });
      queryClient.invalidateQueries({ queryKey: ["team-trends"] });
      onDone();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="What needs attention? A linked task is created automatically."
        className="resize-y"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={clientId || NO_CLIENT}
          onValueChange={(v) => setClientId(v === NO_CLIENT ? "" : v)}
        >
          <SelectTrigger className="h-8 w-auto min-w-0 max-w-[180px]" aria-label="Client">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CLIENT}>No client</SelectItem>
            {hub.clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="text"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="Source label (optional)"
          className="h-8 min-w-[140px] flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={busy || !body.trim()} onClick={submit}>
          Add item
        </Button>
      </div>
    </Card>
  );
}
