"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { MoreHorizontal, Pencil, Trash2, StickyNote, Briefcase, Plus, X, GitBranch, UserCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";
import { SortHeader } from "@/components/ui/SortHeader";
import { Button } from "@/components/ui/button";
import { BadgeDot, badgeTone, badgeToneHover, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PayoutRecord, PayDistributed } from "@/lib/payouts";

// Menu-row look for the inline editor popovers (they hold text inputs, so
// they're Popovers rather than DropdownMenus — a menu would steal focus /
// typeahead from the input).
const optionRowClass =
  "w-full justify-start rounded-2xl px-3 font-normal";

// Inline cell triggers (vertical / sales rep / referral): compact truncating
// text that inherits the surrounding font size (text-sm in the table,
// text-xs on the mobile cards). The max width gives back the -ml-1.5 pull —
// with max-w-full every value lost its last 6px to an ellipsis ("Skinc…").
// On touch screens the 22px trigger gets a ~38px hit area, same look.
const cellTriggerClass =
  "-ml-1.5 h-auto max-w-[calc(100%+0.375rem)] justify-start px-1.5 py-0.5 font-normal text-[length:inherit] text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:after:-inset-y-2";

// Mobile-card link row (View POC / Service / Docs), 2px under the vertical
// trigger: its touch area reaches only 2px up so it doesn't swallow the
// trigger's lower half.
const cardLinkClass =
  "h-auto px-0 py-1 text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:after:-top-0.5";

// ---------------------------------------------------------------------------
// Inline toggle badge
// ---------------------------------------------------------------------------

function ToggleBadge({
  value,
  payoutId,
  field,
  onToggled,
}: {
  value: boolean;
  payoutId: string;
  field: "isSigned" | "isPaid" | "addedToSlack";
  onToggled: () => void;
}) {
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: payoutId, [field]: !value }),
      });
      if (res.ok) onToggled();
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="xs"
      onClick={toggle}
      disabled={pending}
      aria-label={`Toggle ${field === "isSigned" ? "signed" : field === "isPaid" ? "paid" : "slack"}: currently ${value ? "yes" : "no"}`}
      className={cn("gap-1.5", badgeTone[value ? "success" : "danger"], badgeToneHover[value ? "success" : "danger"])}
    >
      <BadgeDot tone={value ? "success" : "danger"} />
      {value ? "Yes" : "No"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Inline Pay Distributed selector
// ---------------------------------------------------------------------------

function PayDistributedBadge({
  value,
  payoutId,
  onChanged,
}: {
  value: PayDistributed;
  payoutId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const options: PayDistributed[] = ["Yes", "No", "Hold Til Full Pay"];

  const tones: Record<PayDistributed, BadgeTone> = {
    Yes: "success",
    No: "danger",
    "Hold Til Full Pay": "warning",
  };

  const select = async (newVal: PayDistributed) => {
    setOpen(false);
    if (newVal === value) return;
    const res = await fetch("/api/admin/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: payoutId, payDistributed: newVal }),
    });
    if (res.ok) onChanged();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className={cn("gap-1.5", badgeTone[tones[value]], badgeToneHover[tones[value]])}
        >
          <BadgeDot tone={tones[value]} />
          {value === "Hold Til Full Pay" ? "Hold" : value}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt}
            onSelect={() => select(opt)}
            className={cn(opt === value && "bg-accent text-accent-foreground")}
          >
            {opt}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Inline Sales Rep selector
// ---------------------------------------------------------------------------

function SalesRepBadge({
  value,
  payoutId,
  options,
  onChanged,
  onSalesRepsChanged,
}: {
  value: string | null;
  payoutId: string;
  options: string[];
  onChanged: () => void;
  onSalesRepsChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  const select = async (newVal: string | null) => {
    setOpen(false);
    if (newVal === value) return;
    const res = await fetch("/api/admin/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: payoutId, salesRep: newVal }),
    });
    if (res.ok) onChanged();
  };

  return (
    <div className="relative min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cellTriggerClass}>
            <span className="min-w-0 truncate">{value || "\u2014"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-52 max-h-64 overflow-y-auto p-1.5"
          // The old menu didn't close on Escape (Escape only cancels the
          // inline "add new" input).
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <SalesRepDropdown
            current={value}
            options={options}
            onSelect={select}
            onSalesRepsChanged={onSalesRepsChanged}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SalesRepDropdown({
  current,
  options,
  onSelect,
  onSalesRepsChanged,
}: {
  current: string | null;
  options: string[];
  onSelect: (v: string | null) => void;
  onSalesRepsChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/payouts/sales-reps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        onSalesRepsChanged();
        onSelect(trimmed);
      }
    } finally {
      setSaving(false);
      setAdding(false);
      setNewName("");
    }
  };

  const handleRemove = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(
      `/api/admin/payouts/sales-reps?name=${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    if (res.ok) onSalesRepsChanged();
  };

  return (
    <>
      {/* None option */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSelect(null)}
        className={cn(
          optionRowClass,
          !current
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground"
        )}
      >
        <span className="italic">None</span>
      </Button>

      {options.map((opt) => (
        <div
          key={opt}
          className={cn(
            "flex w-full items-center justify-between group rounded-2xl",
            opt === current
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted"
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(opt)}
            className={cn(optionRowClass, "flex-1 min-w-0 hover:bg-transparent")}
          >
            <span className="truncate">{opt}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => handleRemove(opt, e)}
            className="mr-1 opacity-60 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:bg-transparent hover:text-destructive"
            title={`Remove ${opt}`}
          >
            <X />
          </Button>
        </div>
      ))}

      {/* Add new */}
      <div className="border-t mt-1 pt-1">
        {adding ? (
          <div className="px-1 py-1 flex gap-1">
            <Input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") { setAdding(false); setNewName(""); }
              }}
              placeholder="Name..."
              className="h-8 flex-1 min-w-0"
              disabled={saving}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAdd}
              disabled={saving || !newName.trim()}
            >
              Add
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            className={optionRowClass}
          >
            <Plus />
            Add new rep
          </Button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline Vertical selector
// ---------------------------------------------------------------------------

function VerticalBadge({
  value,
  payoutId,
  options,
  onChanged,
  onVerticalsChanged,
}: {
  value: string | null;
  payoutId: string;
  options: string[];
  onChanged: () => void;
  onVerticalsChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  const select = async (newVal: string | null) => {
    setOpen(false);
    if (newVal === value) return;
    const res = await fetch("/api/admin/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: payoutId, vertical: newVal }),
    });
    if (res.ok) onChanged();
  };

  return (
    <div className="relative min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cellTriggerClass}>
            <span className="min-w-0 truncate">{value || "\u2014"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-52 max-h-64 overflow-y-auto p-1.5"
          // The old menu didn't close on Escape (Escape only cancels the
          // inline "add new" input).
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <VerticalDropdown
            current={value}
            options={options}
            onSelect={select}
            onVerticalsChanged={onVerticalsChanged}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function VerticalDropdown({
  current,
  options,
  onSelect,
  onVerticalsChanged,
}: {
  current: string | null;
  options: string[];
  onSelect: (v: string | null) => void;
  onVerticalsChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/payouts/verticals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        onVerticalsChanged();
        onSelect(trimmed);
      }
    } finally {
      setSaving(false);
      setAdding(false);
      setNewName("");
    }
  };

  const handleRemove = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(
      `/api/admin/payouts/verticals?name=${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    if (res.ok) onVerticalsChanged();
  };

  return (
    <>
      {/* None option */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSelect(null)}
        className={cn(
          optionRowClass,
          !current
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground"
        )}
      >
        <span className="italic">None</span>
      </Button>

      {options.map((opt) => (
        <div
          key={opt}
          className={cn(
            "flex w-full items-center justify-between group rounded-2xl",
            opt === current
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted"
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(opt)}
            className={cn(optionRowClass, "flex-1 min-w-0 hover:bg-transparent")}
          >
            <span className="truncate">{opt}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => handleRemove(opt, e)}
            className="mr-1 opacity-60 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:bg-transparent hover:text-destructive"
            title={`Remove ${opt}`}
          >
            <X />
          </Button>
        </div>
      ))}

      {/* Add new */}
      <div className="border-t mt-1 pt-1">
        {adding ? (
          <div className="px-1 py-1 flex gap-1">
            <Input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") { setAdding(false); setNewName(""); }
              }}
              placeholder="Name..."
              className="h-8 flex-1 min-w-0"
              disabled={saving}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAdd}
              disabled={saving || !newName.trim()}
            >
              Add
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            className={optionRowClass}
          >
            <Plus />
            Add new vertical
          </Button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline Referral selector (with optional percentage)
// ---------------------------------------------------------------------------

function ReferralBadge({
  value,
  pct,
  payoutId,
  options,
  onChanged,
  onReferralsChanged,
}: {
  value: string | null;
  pct: number | null;
  payoutId: string;
  options: string[];
  onChanged: () => void;
  onReferralsChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  const select = async (newVal: string | null) => {
    setOpen(false);
    if (newVal === value) return;
    const res = await fetch("/api/admin/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: payoutId, referral: newVal }),
    });
    if (res.ok) onChanged();
  };

  const label = value
    ? pct != null ? `${value} (${pct}%)` : value
    : "\u2014";

  return (
    <div className="relative min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cellTriggerClass}>
            <span className="min-w-0 truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-52 max-h-72 overflow-y-auto p-1.5"
          // The old menu didn't close on Escape (Escape only cancels the
          // inline "add new" / percentage inputs).
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <ReferralDropdown
            current={value}
            pct={pct}
            payoutId={payoutId}
            options={options}
            onSelect={select}
            onClose={() => setOpen(false)}
            onReferralsChanged={onReferralsChanged}
            onChanged={onChanged}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ReferralDropdown({
  current,
  pct,
  payoutId,
  options,
  onSelect,
  onClose,
  onReferralsChanged,
  onChanged,
}: {
  current: string | null;
  pct: number | null;
  payoutId: string;
  options: string[];
  onSelect: (v: string | null) => void;
  onClose: () => void;
  onReferralsChanged: () => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editPct, setEditPct] = useState(false);
  const [pctVal, setPctVal] = useState(String(pct ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/payouts/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        onReferralsChanged();
        onSelect(trimmed);
      }
    } finally {
      setSaving(false);
      setAdding(false);
      setNewName("");
    }
  };

  const handleRemove = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(
      `/api/admin/payouts/referrals?name=${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    if (res.ok) onReferralsChanged();
  };

  const handleSavePct = async () => {
    const numVal = pctVal.trim() === "" ? null : Math.round(Number(pctVal));
    const res = await fetch("/api/admin/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: payoutId, referralPct: numVal }),
    });
    if (res.ok) onChanged();
    setEditPct(false);
    onClose();
  };

  return (
    <>
      {/* None option */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSelect(null)}
        className={cn(
          optionRowClass,
          !current
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground"
        )}
      >
        <span className="italic">None</span>
      </Button>

      {options.map((opt) => (
        <div
          key={opt}
          className={cn(
            "flex w-full items-center justify-between group rounded-2xl",
            opt === current
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted"
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(opt)}
            className={cn(optionRowClass, "flex-1 min-w-0 hover:bg-transparent")}
          >
            <span className="truncate">{opt}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => handleRemove(opt, e)}
            className="mr-1 opacity-60 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:bg-transparent hover:text-destructive"
            title={`Remove ${opt}`}
          >
            <X />
          </Button>
        </div>
      ))}

      {/* Add new */}
      <div className="border-t mt-1 pt-1">
        {adding ? (
          <div className="px-1 py-1 flex gap-1">
            <Input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") { setAdding(false); setNewName(""); }
              }}
              placeholder="Name..."
              className="h-8 flex-1 min-w-0"
              disabled={saving}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAdd}
              disabled={saving || !newName.trim()}
            >
              Add
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            className={optionRowClass}
          >
            <Plus />
            Add new referral
          </Button>
        )}
      </div>

      {/* Percentage editor (only when a referral is selected) */}
      {current && (
        <div className="border-t mt-1 pt-1 px-1 py-1">
          {editPct ? (
            <div className="flex gap-1 items-center">
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                max="100"
                value={pctVal}
                onChange={(e) => setPctVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSavePct();
                  if (e.key === "Escape") setEditPct(false);
                }}
                className="h-8 w-20"
                autoFocus
              />
              <span className="text-xs text-muted-foreground">%</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSavePct}
              >
                Save
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setEditPct(true); setPctVal(String(pct ?? "")); }}
              className={cn(optionRowClass, "text-xs text-muted-foreground")}
            >
              {pct != null ? `${pct}% — edit` : "Set percentage..."}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline Distribution Date editor
// ---------------------------------------------------------------------------

function DistDateCell({
  value,
  payoutId,
  onChanged,
}: {
  value: string | null;
  payoutId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className="font-normal text-muted-foreground hover:text-foreground"
          >
            {value ? formatDate(value) : "—"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-60 p-3"
          // The old popover didn't close on Escape.
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DistDatePopover
            value={value}
            payoutId={payoutId}
            onChanged={onChanged}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DistDatePopover({
  value,
  payoutId,
  onChanged,
  onClose,
}: {
  value: string | null;
  payoutId: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(value ?? "");

  const save = async (newDate: string | null) => {
    const res = await fetch("/api/admin/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: payoutId, payDistributedDate: newDate }),
    });
    if (res.ok) onChanged();
    onClose();
  };

  return (
    <div className="grid gap-2">
      <Label className="text-xs text-muted-foreground">
        Distribution Date
      </Label>
      <DatePicker
        value={date}
        onValueChange={setDate}
        aria-label="Distribution Date"
      />
      <div className="flex justify-between">
        {value && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => save(null)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Clear
          </Button>
        )}
        <Button
          size="xs"
          onClick={() => save(date || null)}
          disabled={!date}
          className="ml-auto"
        >
          Save
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions dropdown
// ---------------------------------------------------------------------------

function ActionsCell({
  payout,
  onEdit,
  onDelete,
  onViewDocs,
}: {
  payout: PayoutRecord;
  onEdit: (p: PayoutRecord) => void;
  onDelete: (id: string) => void;
  onViewDocs: (brandName: string) => void;
}) {
  return (
    // modal={false}: "Delete" / "Documents" open Radix dialogs; a modal
    // menu closing underneath them can leave <body> pointer-events stuck.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Payout actions"
          className="text-muted-foreground"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onSelect={() => onEdit(payout)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onViewDocs(payout.brandName)}>
          <FileText /> Documents
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onDelete(payout.id)}
        >
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

function DeleteConfirm({
  brandName,
  onConfirm,
  onCancel,
}: {
  brandName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent
        showCloseButton={false}
        // The old modal had no Escape handler.
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto break-words sm:max-w-sm"
      >
        <DialogHeader>
          <DialogTitle>Delete Payout</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the payout for{" "}
            <span className="font-medium text-foreground">{brandName}</span>?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Detail modal (reused for notes + service)
// ---------------------------------------------------------------------------

function DetailModal({
  brandName,
  label,
  content,
  onClose,
}: {
  brandName: string;
  label: string;
  content: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        // The old modal had no Escape handler.
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle className="break-words leading-snug">{brandName}</DialogTitle>
          <DialogDescription className="text-xs">{label}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6">
          <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        </div>
        <DialogFooter className="shrink-0 px-6 pb-6 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Table
// ---------------------------------------------------------------------------

interface PayoutTableProps {
  payouts: PayoutRecord[];
  isLoading: boolean;
  onEdit: (payout: PayoutRecord) => void;
  onViewDocs: (brandName: string) => void;
  onRefresh: () => void;
  salesRepOptions: string[];
  onSalesRepsChanged: () => void;
  verticalOptions: string[];
  onVerticalsChanged: () => void;
  referralOptions: string[];
  onReferralsChanged: () => void;
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PayoutTable({
  payouts,
  isLoading,
  onEdit,
  onViewDocs,
  onRefresh,
  salesRepOptions,
  onSalesRepsChanged,
  verticalOptions,
  onVerticalsChanged,
  referralOptions,
  onReferralsChanged,
}: PayoutTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notesId, setNotesId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [pocId, setPocId] = useState<string | null>(null);
  const [dateSort, setDateSort] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...payouts].sort((a, b) => {
      const da = a.dateJoined ?? "";
      const db = b.dateJoined ?? "";
      if (da === db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return dateSort === "asc"
        ? da.localeCompare(db)
        : db.localeCompare(da);
    });
  }, [payouts, dateSort]);

  const deletePayout = sorted.find((p) => p.id === deleteId);
  const notesPayout = sorted.find((p) => p.id === notesId);
  const servicePayout = sorted.find((p) => p.id === serviceId);
  const pocPayout = sorted.find((p) => p.id === pocId);

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/admin/payouts?id=${encodeURIComponent(deleteId)}`, { method: "DELETE" });
    setDeleteId(null);
    if (res.ok) onRefresh();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton
            key={i}
            className="h-16"
          />
        ))}
      </div>
    );
  }

  if (payouts.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 md:p-12 text-center">
          <p className="text-muted-foreground text-sm">
            No payouts for this month.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <Card className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="px-4 text-muted-foreground">
                Brand
              </TableHead>
              <TableHead className="px-4 text-muted-foreground">
                <SortHeader
                  label="Joined"
                  active={true}
                  direction={dateSort}
                  onToggle={() => setDateSort(dateSort === "asc" ? "desc" : "asc")}
                />
              </TableHead>
              <TableHead className="px-4 text-muted-foreground">
                Vertical
              </TableHead>
              <TableHead className="text-center text-muted-foreground">
                POC
              </TableHead>
              <TableHead className="text-center text-muted-foreground">
                Service
              </TableHead>
              <TableHead className="px-4 text-right text-muted-foreground">
                Due
              </TableHead>
              <TableHead className="px-4 text-right text-muted-foreground">
                Paid
              </TableHead>
              <TableHead className="px-4 text-muted-foreground">
                Sales Rep
              </TableHead>
              <TableHead className="px-4 text-muted-foreground">
                Referral
              </TableHead>
              <TableHead className="px-2 text-center text-muted-foreground">
                Split
              </TableHead>
              <TableHead className="text-center text-muted-foreground">
                Signed
              </TableHead>
              <TableHead className="text-center text-muted-foreground">
                Paid
              </TableHead>
              <TableHead className="text-center text-muted-foreground">
                Slack
              </TableHead>
              <TableHead className="text-center text-muted-foreground">
                Distributed
              </TableHead>
              <TableHead className="text-center text-muted-foreground">
                Dist. Date
              </TableHead>
              <TableHead className="text-center text-muted-foreground">
                Notes
              </TableHead>
              <TableHead className="text-center text-muted-foreground">
                Docs
              </TableHead>
              <TableHead className="px-2 w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => {
              const underpaid = !p.isPaid && p.amountDue > p.amountPaid;
              return (
              <TableRow
                key={p.id}
                className={cn(
                  underpaid && "bg-destructive/5 hover:bg-destructive/10"
                )}
              >
                <TableCell className="px-4 font-medium">
                  {p.brandName}
                </TableCell>
                <TableCell className="px-4 text-muted-foreground">
                  {formatDate(p.dateJoined)}
                </TableCell>
                <TableCell className="px-4">
                  <VerticalBadge
                    value={p.vertical}
                    payoutId={p.id}
                    options={verticalOptions}
                    onChanged={onRefresh}
                    onVerticalsChanged={onVerticalsChanged}
                  />
                </TableCell>
                <TableCell className="text-center">
                  {p.pointOfContact ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPocId(p.id)}
                      aria-label="View point of contact"
                      className="size-7 text-muted-foreground"
                    >
                      <UserCircle className="size-3.5" />
                    </Button>
                  ) : (
                    <span className="text-muted-foreground/40">{"\u2014"}</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {p.service ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setServiceId(p.id)}
                      aria-label="View service"
                      className="size-7 text-muted-foreground"
                    >
                      <Briefcase className="size-3.5" />
                    </Button>
                  ) : (
                    <span className="text-muted-foreground/40">{"\u2014"}</span>
                  )}
                </TableCell>
                <TableCell className="px-4 text-right font-medium tabular-nums">
                  {formatCents(p.amountDue)}
                </TableCell>
                <TableCell className="px-4 text-right font-medium tabular-nums">
                  {formatCents(p.amountPaid)}
                </TableCell>
                <TableCell className="px-4">
                  <SalesRepBadge
                    value={p.salesRep}
                    payoutId={p.id}
                    options={salesRepOptions}
                    onChanged={onRefresh}
                    onSalesRepsChanged={onSalesRepsChanged}
                  />
                </TableCell>
                <TableCell className="px-4">
                  <ReferralBadge
                    value={p.referral}
                    pct={p.referralPct}
                    payoutId={p.id}
                    options={referralOptions}
                    onChanged={onRefresh}
                    onReferralsChanged={onReferralsChanged}
                  />
                </TableCell>
                <TableCell className="px-2 text-center">
                  {p.commissionSplit && p.splitDetails.length > 0 ? (
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => onEdit(p)}
                      title={p.splitDetails.map((s) => `${s.name}: ${s.pct}%`).join(", ")}
                    >
                      <GitBranch />
                      {p.splitDetails.length}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground/40">{"\u2014"}</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <ToggleBadge
                    value={p.isSigned}
                    payoutId={p.id}
                    field="isSigned"
                    onToggled={onRefresh}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <ToggleBadge
                    value={p.isPaid}
                    payoutId={p.id}
                    field="isPaid"
                    onToggled={onRefresh}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <ToggleBadge
                    value={p.addedToSlack}
                    payoutId={p.id}
                    field="addedToSlack"
                    onToggled={onRefresh}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <PayDistributedBadge
                    value={p.payDistributed}
                    payoutId={p.id}
                    onChanged={onRefresh}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <DistDateCell
                    value={p.payDistributedDate}
                    payoutId={p.id}
                    onChanged={onRefresh}
                  />
                </TableCell>
                <TableCell className="text-center">
                  {p.paymentNotes ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setNotesId(p.id)}
                      aria-label="View payment notes"
                      className="size-7 text-muted-foreground"
                    >
                      <StickyNote className="size-3.5" />
                    </Button>
                  ) : (
                    <span className="text-muted-foreground/40">{"\u2014"}</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onViewDocs(p.brandName)}
                    className="size-7 text-muted-foreground"
                    title="View documents"
                  >
                    <FileText className="size-3.5" />
                  </Button>
                </TableCell>
                <TableCell className="px-2">
                  <ActionsCell
                    payout={p}
                    onEdit={onEdit}
                    onDelete={setDeleteId}
                    onViewDocs={onViewDocs}
                  />
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {sorted.map((p) => {
          const underpaid = !p.isPaid && p.amountDue > p.amountPaid;
          return (
          <Card
            key={p.id}
            className={cn(
              "p-4",
              underpaid && "bg-destructive/5 ring-destructive/20 dark:ring-destructive/20"
            )}
          >
            {/* Top: Brand + date + actions */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {p.brandName}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <VerticalBadge
                    value={p.vertical}
                    payoutId={p.id}
                    options={verticalOptions}
                    onChanged={onRefresh}
                    onVerticalsChanged={onVerticalsChanged}
                  />
                  <span>&middot;</span>
                  <span>{formatDate(p.dateJoined)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                  {p.pointOfContact && (
                    <Button
                      variant="link"
                      size="xs"
                      onClick={() => setPocId(p.id)}
                      className={cardLinkClass}
                    >
                      <UserCircle />
                      View POC
                    </Button>
                  )}
                  {p.service && (
                    <Button
                      variant="link"
                      size="xs"
                      onClick={() => setServiceId(p.id)}
                      className={cardLinkClass}
                    >
                      <Briefcase />
                      View Service
                    </Button>
                  )}
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => onViewDocs(p.brandName)}
                    className={cardLinkClass}
                  >
                    <FileText />
                    Docs
                  </Button>
                </div>
              </div>
              <ActionsCell
                payout={p}
                onEdit={onEdit}
                onDelete={setDeleteId}
                onViewDocs={onViewDocs}
              />
            </div>

            {/* Amounts */}
            <div className="flex items-center gap-3 mb-2">
              <div>
                <span className="text-[10px] text-muted-foreground block">Due</span>
                <span className="font-semibold text-sm tabular-nums">
                  {formatCents(p.amountDue)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Paid</span>
                <span className="font-semibold text-sm tabular-nums">
                  {formatCents(p.amountPaid)}
                </span>
              </div>
            </div>

            {/* Sales Rep */}
            <div className="flex items-center gap-1 mb-3 min-w-0">
              <span className="text-[10px] text-muted-foreground shrink-0">Rep</span>
              {/* No overflow clip here: it would cut the trigger's touch
                  area. The trigger truncates its own label. */}
              <div className="min-w-0 text-xs text-muted-foreground">
                <SalesRepBadge
                  value={p.salesRep}
                  payoutId={p.id}
                  options={salesRepOptions}
                  onChanged={onRefresh}
                  onSalesRepsChanged={onSalesRepsChanged}
                />
              </div>
            </div>

            {/* Referral */}
            {(p.referral || p.referralPct != null) && (
              <div className="flex items-center gap-1 mb-3 min-w-0">
                <span className="text-[10px] text-muted-foreground shrink-0">Ref</span>
                <div className="min-w-0 text-xs text-muted-foreground">
                  <ReferralBadge
                    value={p.referral}
                    pct={p.referralPct}
                    payoutId={p.id}
                    options={referralOptions}
                    onChanged={onRefresh}
                    onReferralsChanged={onReferralsChanged}
                  />
                </div>
              </div>
            )}

            {/* Status badges with labels */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Signed</span>
                <ToggleBadge
                  value={p.isSigned}
                  payoutId={p.id}
                  field="isSigned"
                  onToggled={onRefresh}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Paid</span>
                <ToggleBadge
                  value={p.isPaid}
                  payoutId={p.id}
                  field="isPaid"
                  onToggled={onRefresh}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Slack</span>
                <ToggleBadge
                  value={p.addedToSlack}
                  payoutId={p.id}
                  field="addedToSlack"
                  onToggled={onRefresh}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Dist.</span>
                <PayDistributedBadge
                  value={p.payDistributed}
                  payoutId={p.id}
                  onChanged={onRefresh}
                />
              </div>
              {p.commissionSplit && p.splitDetails.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Split</span>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => onEdit(p)}
                  >
                    <GitBranch />
                    {p.splitDetails.length}
                  </Button>
                </div>
              )}
              {p.payDistributedDate && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Dist. Date</span>
                  <span className="text-[11px] text-muted-foreground">{formatDate(p.payDistributedDate)}</span>
                </div>
              )}
            </div>

            {/* Payment notes icon */}
            {p.paymentNotes && (
              <div className="mt-3 pt-3 border-t flex items-center gap-1.5">
                <Button
                  variant="link"
                  size="xs"
                  onClick={() => setNotesId(p.id)}
                  className="h-auto px-0 py-1 text-muted-foreground hover:text-foreground"
                >
                  <StickyNote />
                  View Notes
                </Button>
              </div>
            )}
          </Card>
          );
        })}
      </div>

      {/* POC modal */}
      {pocId && pocPayout?.pointOfContact && (
        <DetailModal
          brandName={pocPayout.brandName}
          label="Point of Contact"
          content={pocPayout.pointOfContact}
          onClose={() => setPocId(null)}
        />
      )}

      {/* Service modal */}
      {serviceId && servicePayout?.service && (
        <DetailModal
          brandName={servicePayout.brandName}
          label="Service"
          content={servicePayout.service}
          onClose={() => setServiceId(null)}
        />
      )}

      {/* Notes modal */}
      {notesId && notesPayout?.paymentNotes && (
        <DetailModal
          brandName={notesPayout.brandName}
          label="Payment Notes"
          content={notesPayout.paymentNotes}
          onClose={() => setNotesId(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteId && deletePayout && (
        <DeleteConfirm
          brandName={deletePayout.brandName}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </>
  );
}
