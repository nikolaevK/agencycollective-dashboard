"use client";

import { memo, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  StickyNote,
  Tag,
  AlertTriangle,
  User,
  BellOff,
  GitBranch,
  Workflow as WorkflowIcon,
  MessageSquare,
  Globe,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  useGhlContactNotes,
  useGhlContactAppointments,
  useCreateGhlNote,
} from "@/hooks/useGhlContacts";
import { cleanGhlNoteBody } from "@/lib/ghl/noteFormat";
import { GhlConversationsTab } from "./GhlConversationsTab";
import type {
  GhlContact,
  GhlContactAppointment,
  GhlContactNote,
  GhlOpportunity,
  GhlPipeline,
  GhlUser,
  GhlWorkflow,
} from "@/types/ghl";

interface Props {
  contact: GhlContact;
  users: Record<string, GhlUser>;
  pipelines: GhlPipeline[];
  workflows: GhlWorkflow[];
}

type Tab = "notes" | "appointments" | "messages" | "opportunities" | "tags";

const noteMarkdownComponents = {
  h1: (p: { children?: React.ReactNode }) => (
    <h1 className="text-base font-bold text-foreground mt-3 mb-2 first:mt-0">{p.children}</h1>
  ),
  h2: (p: { children?: React.ReactNode }) => (
    <h2 className="text-sm font-bold text-foreground mt-3 mb-2 first:mt-0">{p.children}</h2>
  ),
  h3: (p: { children?: React.ReactNode }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1 first:mt-0">{p.children}</h3>
  ),
  p: (p: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed text-foreground/85 mb-2 last:mb-0">{p.children}</p>
  ),
  strong: (p: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{p.children}</strong>
  ),
  em: (p: { children?: React.ReactNode }) => <em className="italic">{p.children}</em>,
  ul: (p: { children?: React.ReactNode }) => (
    <ul className="list-disc ml-5 space-y-1 text-sm mb-2">{p.children}</ul>
  ),
  ol: (p: { children?: React.ReactNode }) => (
    <ol className="list-decimal ml-5 space-y-1 text-sm mb-2">{p.children}</ol>
  ),
  li: (p: { children?: React.ReactNode }) => (
    <li className="text-sm text-foreground/85 leading-relaxed">{p.children}</li>
  ),
  code: (p: { children?: React.ReactNode }) => (
    <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">{p.children}</code>
  ),
  blockquote: (p: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-border pl-3 italic text-muted-foreground my-2">{p.children}</blockquote>
  ),
  a: (p: { children?: React.ReactNode; href?: string }) => (
    <a
      href={p.href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {p.children}
    </a>
  ),
};

function userName(users: Record<string, GhlUser>, id?: string | null): string | null {
  if (!id) return null;
  const u = users[id];
  if (!u) return null;
  return u.name || u.email || null;
}

export function GhlContactDetail({ contact, users, pipelines, workflows }: Props) {
  const [tab, setTab] = useState<Tab>("notes");

  return (
    <div className="flex h-full flex-col">
      <Header contact={contact} users={users} />

      <div className="flex border-b border-border/60 px-4 overflow-x-auto">
        {(["notes", "appointments", "messages", "opportunities", "tags"] as Tab[]).map((key) => (
          <TabButton
            key={key}
            active={tab === key}
            onClick={() => setTab(key)}
            label={labelFor(key, contact)}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "notes" && <NotesPane contactId={contact.id} users={users} />}
        {tab === "appointments" && <AppointmentsPane contactId={contact.id} users={users} />}
        {tab === "messages" && <GhlConversationsTab contactId={contact.id} users={users} />}
        {tab === "opportunities" && (
          <OpportunitiesPane contact={contact} pipelines={pipelines} />
        )}
        {tab === "tags" && (
          <TagsPane contact={contact} users={users} workflows={workflows} />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
    </button>
  );
}

function labelFor(tab: Tab, contact: GhlContact): React.ReactNode {
  // Notes + opportunities + messages are pre-enriched per-contact and are
  // accurate. Appointments comes from the windowed (-180d/+90d) bulk fetch
  // so could undercount very old/future bookings — show the count anyway,
  // it's still informative for typical use.
  if (tab === "notes") {
    return countLabel("Notes", contact.noteCount ?? 0);
  }
  if (tab === "appointments") {
    return countLabel("Appointments", contact.appointmentCount ?? 0);
  }
  if (tab === "messages") {
    // Conversation data is only fetched after the Messages tab is opened,
    // so we don't have a count to show here. The thread switcher inside the
    // tab content shows the per-channel breakdown live.
    return "Messages";
  }
  if (tab === "opportunities") {
    return countLabel("Opportunities", contact.opportunities?.length ?? 0);
  }
  return "Tags & Info";
}

function countLabel(label: string, n: number): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {n > 0 && <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{n}</span>}
    </span>
  );
}

// ── Header ───────────────────────────────────────────────────────────

function Header({ contact, users }: { contact: GhlContact; users: Record<string, GhlUser> }) {
  const name =
    contact.contactName?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    contact.email ||
    contact.phone ||
    contact.id;

  const assigned = userName(users, contact.assignedTo);

  return (
    <div className="border-b border-border/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground truncate">{name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {assigned && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Assigned to <span className="text-foreground font-medium">{assigned}</span>
              </span>
            )}
            {contact.source && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                {contact.source}
              </span>
            )}
            {contact.dnd && (
              <Badge variant="warning" className="inline-flex items-center gap-1">
                <BellOff className="h-3 w-3" />
                DND
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {contact.email && (
          <Field icon={Mail} value={contact.email} href={`mailto:${contact.email}`} />
        )}
        {contact.phone && (
          <Field icon={Phone} value={contact.phone} href={`tel:${contact.phone}`} />
        )}
        {contact.companyName && <Field icon={Building2} value={contact.companyName} />}
        {(contact.city || contact.state || contact.country) && (
          <Field
            icon={MapPin}
            value={[contact.city, contact.state, contact.country].filter(Boolean).join(", ")}
          />
        )}
        {contact.additionalEmails.map((e) => (
          <Field key={`ae-${e}`} icon={Mail} value={e} href={`mailto:${e}`} muted />
        ))}
        {contact.additionalPhones.map((p) => (
          <Field key={`ap-${p}`} icon={Phone} value={p} href={`tel:${p}`} muted />
        ))}
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  value,
  href,
  muted,
}: {
  icon: typeof Mail;
  value: string;
  href?: string;
  muted?: boolean;
}) {
  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm",
        muted ? "text-muted-foreground/80" : "text-muted-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{value}</span>
    </span>
  );
  if (href) {
    return (
      <a href={href} className="hover:text-foreground transition-colors min-w-0">
        {inner}
      </a>
    );
  }
  return inner;
}

// ── Notes ────────────────────────────────────────────────────────────

function NotesPane({ contactId, users }: { contactId: string; users: Record<string, GhlUser> }) {
  const { data, isLoading, error } = useGhlContactNotes(contactId);
  // Memoize sort so a parent re-render doesn't rebuild the array (which
  // would change keys' positions and bust each row's React.memo).
  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort(
      (a, b) => Date.parse(b.dateAdded || "") - Date.parse(a.dateAdded || "")
    );
  }, [data]);

  return (
    <div className="space-y-3">
      <NoteComposer contactId={contactId} />
      {error ? (
        <ErrorBox message={(error as Error).message} />
      ) : isLoading ? (
        <PaneSkeleton />
      ) : !data || data.length === 0 ? (
        <Empty icon={StickyNote} message="No notes for this contact yet." />
      ) : (
        <ul className="space-y-3">
          {sorted.map((n) => (
            // Resolve the author name HERE so NoteCard never receives the
            // volatile `users` Record — keeps its React.memo intact across
            // catalog refetches.
            <NoteCard key={n.id} note={n} author={userName(users, n.userId)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteComposer({ contactId }: { contactId: string }) {
  const [body, setBody] = useState("");
  const create = useCreateGhlNote(contactId);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || create.isPending) return;
    try {
      await create.mutateAsync({ body: trimmed });
      setBody("");
    } catch {
      // error rendered below via mutation state
    }
  };

  return (
    <div className="rounded-lg border border-border/50 bg-card p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add a note… (⌘/Ctrl + Enter to save)"
        rows={3}
        disabled={create.isPending}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-end gap-3">
        {create.isError && (
          <span className="text-xs text-destructive truncate">
            {(create.error as Error).message}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          {body.length}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() || create.isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            "bg-foreground text-background hover:opacity-90",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {create.isPending ? "Adding…" : "Add note"}
        </button>
      </div>
    </div>
  );
}

const NoteCard = memo(function NoteCard({ note, author }: { note: GhlContactNote; author: string | null }) {
  // The clean-up pass strips the outer HTML wrapper and decodes a couple
  // dozen entities — fast in isolation, but with React.memo on the card the
  // useMemo means this only runs once per unique note body across every
  // re-render of the parent.
  const cleaned = useMemo(() => cleanGhlNoteBody(note.body), [note.body]);
  return (
    <li className="rounded-lg border border-border/50 bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
        <span className="inline-flex items-center gap-1">
          <StickyNote className="h-3.5 w-3.5" />
          {formatDateTime(note.dateAdded)}
        </span>
        {author && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {author}
          </span>
        )}
      </div>
      {cleaned ? (
        <div className="text-foreground/90">
          <ReactMarkdown components={noteMarkdownComponents}>{cleaned}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">(empty)</p>
      )}
    </li>
  );
});

// ── Appointments ─────────────────────────────────────────────────────

function AppointmentsPane({ contactId, users }: { contactId: string; users: Record<string, GhlUser> }) {
  const { data, isLoading, error } = useGhlContactAppointments(contactId);
  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
      const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
      return tb - ta;
    });
  }, [data]);
  if (error) return <ErrorBox message={(error as Error).message} />;
  if (isLoading) return <PaneSkeleton />;
  if (!data || data.length === 0) {
    return <Empty icon={Calendar} message="No appointments for this contact." />;
  }
  return (
    <ul className="space-y-3">
      {sorted.map((a) => (
        <AppointmentCard key={a.id} appt={a} closer={userName(users, a.assignedUserId)} />
      ))}
    </ul>
  );
}

const STATUS_VARIANTS: Record<string, string> = {
  confirmed: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  showed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  show: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  noshow: "bg-red-500/15 text-red-700 dark:text-red-400",
  "no-show": "bg-red-500/15 text-red-700 dark:text-red-400",
  cancelled: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  canceled: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  new: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  invalid: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
};

function statusClass(status: string): string {
  return STATUS_VARIANTS[status.toLowerCase()] ?? "bg-muted text-muted-foreground";
}

const AppointmentCard = memo(function AppointmentCard({
  appt,
  closer,
}: {
  appt: GhlContactAppointment;
  closer: string | null;
}) {
  return (
    <li className="rounded-lg border border-border/50 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground truncate">
            {appt.title || "(untitled)"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatRange(appt.startTime, appt.endTime)}
          </p>
        </div>
        {appt.appointmentStatus && (
          <span
            className={cn(
              "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              statusClass(appt.appointmentStatus)
            )}
          >
            {appt.appointmentStatus}
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        {closer && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            <span className="truncate">
              Assigned to <span className="text-foreground font-medium">{closer}</span>
            </span>
          </span>
        )}
        {appt.address && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{appt.address}</span>
          </span>
        )}
        {appt.meetingLocationType && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span className="truncate">{appt.meetingLocationType}</span>
          </span>
        )}
      </div>
      {appt.notes && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{appt.notes}</p>
      )}
    </li>
  );
});

// ── Opportunities ─────────────────────────────────────────────────────

function OpportunitiesPane({
  contact,
  pipelines,
}: {
  contact: GhlContact;
  pipelines: GhlPipeline[];
}) {
  const sorted = useMemo(() => {
    const opps = contact.opportunities ?? [];
    return [...opps].sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  }, [contact.opportunities]);
  if (sorted.length === 0) {
    return <Empty icon={GitBranch} message="No opportunities tracked for this contact." />;
  }
  return (
    <ul className="space-y-3">
      {sorted.map((o) => (
        <OpportunityCard key={o.id} opp={o} pipelines={pipelines} />
      ))}
    </ul>
  );
}

const OpportunityCard = memo(function OpportunityCard({ opp, pipelines }: { opp: GhlOpportunity; pipelines: GhlPipeline[] }) {
  const p = pipelines.find((p) => p.id === opp.pipelineId);
  const stage = p?.stages.find((s) => s.id === opp.pipelineStageId);
  const status = (opp.status ?? "open").toLowerCase();
  const statusColor =
    status === "won"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : status === "lost"
      ? "bg-red-500/15 text-red-700 dark:text-red-400"
      : status === "abandoned"
      ? "bg-slate-500/15 text-slate-700 dark:text-slate-400"
      : "bg-blue-500/15 text-blue-700 dark:text-blue-400";

  return (
    <li className="rounded-lg border border-border/50 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground truncate">
            {opp.name || "(untitled opportunity)"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {p?.name ?? "Unknown pipeline"}
            {stage?.name ? ` · ${stage.name}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
            statusColor
          )}
        >
          {opp.status ?? "open"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        {opp.monetaryValue !== null && (
          <span className="inline-flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            <span className="text-foreground font-medium">
              {opp.monetaryValue.toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
              })}
            </span>
          </span>
        )}
        {opp.source && (
          <span className="inline-flex items-center gap-1">
            <Globe className="h-3 w-3" />
            <span className="truncate">{opp.source}</span>
          </span>
        )}
        {opp.updatedAt && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Updated {formatRelative(opp.updatedAt)}
          </span>
        )}
      </div>
    </li>
  );
});

// ── Tags & Info ──────────────────────────────────────────────────────

function TagsPane({
  contact,
  users,
  workflows,
}: {
  contact: GhlContact;
  users: Record<string, GhlUser>;
  workflows: GhlWorkflow[];
}) {
  const assigned = userName(users, contact.assignedTo);
  const enrolledWorkflows = (contact.workflowIds ?? [])
    .map((id) => workflows.find((w) => w.id === id))
    .filter((w): w is GhlWorkflow => Boolean(w));

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Tag className="h-4 w-4" /> Tags
        </h3>
        {contact.tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {contact.tags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <WorkflowIcon className="h-4 w-4" /> Active workflows
        </h3>
        {enrolledWorkflows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {(contact.workflowIds ?? []).length > 0
              ? `${(contact.workflowIds ?? []).length} workflow id${
                  (contact.workflowIds ?? []).length === 1 ? "" : "s"
                } (names unavailable — workflow scope missing).`
              : "Not currently enrolled in any workflows."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {enrolledWorkflows.map((w) => (
              <Badge key={w.id} variant="secondary" className="inline-flex items-center gap-1">
                <WorkflowIcon className="h-3 w-3" />
                {w.name}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Details</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Detail label="Source" value={contact.source} />
          <Detail label="Type" value={contact.type} />
          <Detail label="Assigned to" value={assigned} />
          <Detail label="Timezone" value={contact.timezone} />
          <Detail label="Postal code" value={contact.postalCode} />
          <Detail label="DND" value={contact.dnd ? "Yes" : null} />
          <Detail label="Created" value={formatDateTime(contact.dateAdded)} />
          <Detail label="Updated" value={formatDateTime(contact.dateUpdated)} />
        </dl>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/30 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground text-right truncate">{value || "—"}</dd>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function time(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return "(no start time)";
  const s = formatDateTime(start);
  if (!end) return s;
  try {
    const e = new Date(end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${s} – ${e}`;
  } catch {
    return s;
  }
}

function formatRelative(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const diffMs = Date.now() - ms;
  const days = Math.round(diffMs / 86_400_000);
  if (Math.abs(days) < 1) return "today";
  if (days < 0) return `in ${-days}d`;
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(days / 365);
  return `${years}y ago`;
}

function PaneSkeleton() {
  return (
    <ul className="space-y-3">
      {[1, 2, 3].map((i) => (
        <li key={i} className="rounded-lg border border-border/50 bg-card p-4">
          <div className="h-3 w-24 animate-pulse rounded bg-muted mb-3" />
          <div className="h-4 w-full animate-pulse rounded bg-muted mb-2" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}

function Empty({ icon: Icon, message }: { icon: typeof Calendar; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
      <Icon className="h-8 w-8 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  const isConfig = /not configured/i.test(message);
  return (
    <div className="m-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <div className="flex items-center gap-2 text-destructive font-medium">
        <AlertTriangle className="h-4 w-4" />
        {isConfig ? "GHL not connected" : "Something went wrong"}
      </div>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{message}</p>
    </div>
  );
}
