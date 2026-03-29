"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Pencil, Trash2, StickyNote, Briefcase, Plus, X, GitBranch, UserCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";
import { SortHeader } from "@/components/ui/SortHeader";
import type { PayoutRecord, PayDistributed } from "@/lib/payouts";

// ---------------------------------------------------------------------------
// Shared dropdown positioning (flips above anchor when near viewport bottom)
// ---------------------------------------------------------------------------

function calcDropdownPos(
  anchor: HTMLElement,
  dropdownEl: HTMLElement | null,
  opts: { leftOffset?: number; fallbackHeight?: number } = {},
) {
  const rect = anchor.getBoundingClientRect();
  const dh = dropdownEl?.offsetHeight || opts.fallbackHeight || 260;
  const dw = dropdownEl?.offsetWidth || 208;
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow >= dh + 8
    ? rect.bottom + 4
    : Math.max(4, rect.top - dh - 4);
  const left = Math.min(
    Math.max(4, rect.left + (opts.leftOffset || 0)),
    window.innerWidth - dw - 8,
  );
  return { top, left };
}

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
    <button
      onClick={toggle}
      disabled={pending}
      aria-label={`Toggle ${field === "isSigned" ? "signed" : field === "isPaid" ? "paid" : "slack"}: currently ${value ? "yes" : "no"}`}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
        pending && "opacity-50",
        value
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
          : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
      )}
    >
      {value ? "Yes" : "No"}
    </button>
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
  const btnRef = useRef<HTMLButtonElement>(null);

  const colors: Record<PayDistributed, string> = {
    Yes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
    No: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
    "Hold Til Full Pay":
      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
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
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
          colors[value]
        )}
      >
        {value === "Hold Til Full Pay" ? "Hold" : value}
      </button>
      {open && (
        <PayDistributedDropdown
          current={value}
          onSelect={select}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </div>
  );
}

function PayDistributedDropdown({
  current,
  onSelect,
  onClose,
  anchorRef,
}: {
  current: PayDistributed;
  onSelect: (v: PayDistributed) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const options: PayDistributed[] = ["Yes", "No", "Hold Til Full Pay"];

  useEffect(() => {
    if (!anchorRef.current) return;
    setPos(calcDropdownPos(anchorRef.current, null, { fallbackHeight: 120 }));
  }, [anchorRef]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] w-44 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
        style={{ top: pos.top, left: pos.left }}
      >
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className={cn(
              "flex w-full items-center px-3 py-1.5 text-sm transition-colors",
              opt === current
                ? "bg-accent text-accent-foreground"
                : "text-foreground hover:bg-accent"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </>,
    document.body
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
  const btnRef = useRef<HTMLButtonElement>(null);

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
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="text-left text-muted-foreground hover:text-foreground transition-colors cursor-pointer whitespace-nowrap truncate block max-w-full"
      >
        {value || "\u2014"}
      </button>
      {open && (
        <SalesRepDropdown
          current={value}
          options={options}
          onSelect={select}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
          onSalesRepsChanged={onSalesRepsChanged}
        />
      )}
    </div>
  );
}

function SalesRepDropdown({
  current,
  options,
  onSelect,
  onClose,
  anchorRef,
  onSalesRepsChanged,
}: {
  current: string | null;
  options: string[];
  onSelect: (v: string | null) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onSalesRepsChanged: () => void;
}) {
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    setPos(calcDropdownPos(anchorRef.current, null, { fallbackHeight: 260 }));
    requestAnimationFrame(() => {
      if (anchorRef.current) {
        setPos(calcDropdownPos(anchorRef.current, dropdownRef.current, { fallbackHeight: 260 }));
      }
    });
  }, [anchorRef]);

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

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-[61] w-52 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100 max-h-64 overflow-y-auto"
        style={{ top: pos.top, left: pos.left }}
      >
        {/* None option */}
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center px-3 py-1.5 text-sm transition-colors",
            !current
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          <span className="italic">None</span>
        </button>

        {options.map((opt) => (
          <div
            key={opt}
            className={cn(
              "flex w-full items-center justify-between group",
              opt === current
                ? "bg-accent text-accent-foreground"
                : "text-foreground hover:bg-accent"
            )}
          >
            <button
              onClick={() => onSelect(opt)}
              className="flex-1 text-left px-3 py-1.5 text-sm transition-colors"
            >
              {opt}
            </button>
            <button
              onClick={(e) => handleRemove(opt, e)}
              className="opacity-0 group-hover:opacity-100 px-2 py-1.5 text-muted-foreground hover:text-destructive transition-all"
              title={`Remove ${opt}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Add new */}
        <div className="border-t border-border mt-1 pt-1">
          {adding ? (
            <div className="px-2 py-1.5 flex gap-1">
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") { setAdding(false); setNewName(""); }
                }}
                placeholder="Name..."
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-input bg-background text-foreground"
                disabled={saving}
              />
              <button
                onClick={handleAdd}
                disabled={saving || !newName.trim()}
                className="px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-accent transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add new rep
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
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
  const btnRef = useRef<HTMLButtonElement>(null);

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
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="text-left text-muted-foreground hover:text-foreground transition-colors cursor-pointer whitespace-nowrap truncate block max-w-full"
      >
        {value || "\u2014"}
      </button>
      {open && (
        <VerticalDropdown
          current={value}
          options={options}
          onSelect={select}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
          onVerticalsChanged={onVerticalsChanged}
        />
      )}
    </div>
  );
}

function VerticalDropdown({
  current,
  options,
  onSelect,
  onClose,
  anchorRef,
  onVerticalsChanged,
}: {
  current: string | null;
  options: string[];
  onSelect: (v: string | null) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onVerticalsChanged: () => void;
}) {
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    setPos(calcDropdownPos(anchorRef.current, null, { fallbackHeight: 260 }));
    requestAnimationFrame(() => {
      if (anchorRef.current) {
        setPos(calcDropdownPos(anchorRef.current, dropdownRef.current, { fallbackHeight: 260 }));
      }
    });
  }, [anchorRef]);

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

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-[61] w-52 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100 max-h-64 overflow-y-auto"
        style={{ top: pos.top, left: pos.left }}
      >
        {/* None option */}
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center px-3 py-1.5 text-sm transition-colors",
            !current
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          <span className="italic">None</span>
        </button>

        {options.map((opt) => (
          <div
            key={opt}
            className={cn(
              "flex w-full items-center justify-between group",
              opt === current
                ? "bg-accent text-accent-foreground"
                : "text-foreground hover:bg-accent"
            )}
          >
            <button
              onClick={() => onSelect(opt)}
              className="flex-1 text-left px-3 py-1.5 text-sm transition-colors"
            >
              {opt}
            </button>
            <button
              onClick={(e) => handleRemove(opt, e)}
              className="opacity-0 group-hover:opacity-100 px-2 py-1.5 text-muted-foreground hover:text-destructive transition-all"
              title={`Remove ${opt}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Add new */}
        <div className="border-t border-border mt-1 pt-1">
          {adding ? (
            <div className="px-2 py-1.5 flex gap-1">
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") { setAdding(false); setNewName(""); }
                }}
                placeholder="Name..."
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-input bg-background text-foreground"
                disabled={saving}
              />
              <button
                onClick={handleAdd}
                disabled={saving || !newName.trim()}
                className="px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-accent transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add new vertical
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
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
  const btnRef = useRef<HTMLButtonElement>(null);

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
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="text-left text-muted-foreground hover:text-foreground transition-colors cursor-pointer whitespace-nowrap truncate block max-w-full"
      >
        {label}
      </button>
      {open && (
        <ReferralDropdown
          current={value}
          pct={pct}
          payoutId={payoutId}
          options={options}
          onSelect={select}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
          onReferralsChanged={onReferralsChanged}
          onChanged={onChanged}
        />
      )}
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
  anchorRef,
  onReferralsChanged,
  onChanged,
}: {
  current: string | null;
  pct: number | null;
  payoutId: string;
  options: string[];
  onSelect: (v: string | null) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onReferralsChanged: () => void;
  onChanged: () => void;
}) {
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editPct, setEditPct] = useState(false);
  const [pctVal, setPctVal] = useState(String(pct ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    // Initial position with fallback height
    setPos(calcDropdownPos(anchorRef.current, null, { fallbackHeight: 300 }));
    // Reposition after render with actual dropdown dimensions
    requestAnimationFrame(() => {
      if (anchorRef.current) {
        setPos(calcDropdownPos(anchorRef.current, dropdownRef.current, { fallbackHeight: 300 }));
      }
    });
  }, [anchorRef]);

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

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-[61] w-52 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100 max-h-72 overflow-y-auto"
        style={{ top: pos.top, left: pos.left }}
      >
        {/* None option */}
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center px-3 py-1.5 text-sm transition-colors",
            !current
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          <span className="italic">None</span>
        </button>

        {options.map((opt) => (
          <div
            key={opt}
            className={cn(
              "flex w-full items-center justify-between group",
              opt === current
                ? "bg-accent text-accent-foreground"
                : "text-foreground hover:bg-accent"
            )}
          >
            <button
              onClick={() => onSelect(opt)}
              className="flex-1 text-left px-3 py-1.5 text-sm transition-colors"
            >
              {opt}
            </button>
            <button
              onClick={(e) => handleRemove(opt, e)}
              className="opacity-0 group-hover:opacity-100 px-2 py-1.5 text-muted-foreground hover:text-destructive transition-all"
              title={`Remove ${opt}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Add new */}
        <div className="border-t border-border mt-1 pt-1">
          {adding ? (
            <div className="px-2 py-1.5 flex gap-1">
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") { setAdding(false); setNewName(""); }
                }}
                placeholder="Name..."
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-input bg-background text-foreground"
                disabled={saving}
              />
              <button
                onClick={handleAdd}
                disabled={saving || !newName.trim()}
                className="px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-accent transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add new referral
            </button>
          )}
        </div>

        {/* Percentage editor (only when a referral is selected) */}
        {current && (
          <div className="border-t border-border mt-1 pt-1 px-3 py-2">
            {editPct ? (
              <div className="flex gap-1 items-center">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={pctVal}
                  onChange={(e) => setPctVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSavePct();
                    if (e.key === "Escape") setEditPct(false);
                  }}
                  className="w-16 px-2 py-1 text-xs rounded border border-input bg-background text-foreground"
                  autoFocus
                />
                <span className="text-xs text-muted-foreground">%</span>
                <button
                  onClick={handleSavePct}
                  className="px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setEditPct(true); setPctVal(String(pct ?? "")); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {pct != null ? `${pct}% — edit` : "Set percentage..."}
              </button>
            )}
          </div>
        )}
      </div>
    </>,
    document.body
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
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer whitespace-nowrap text-[11px]"
      >
        {value ? formatDate(value) : "—"}
      </button>
      {open && (
        <DistDatePopover
          value={value}
          payoutId={payoutId}
          onChanged={onChanged}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </div>
  );
}

function DistDatePopover({
  value,
  payoutId,
  onChanged,
  onClose,
  anchorRef,
}: {
  value: string | null;
  payoutId: string;
  onChanged: () => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [date, setDate] = useState(value ?? "");

  useEffect(() => {
    if (!anchorRef.current) return;
    setPos(calcDropdownPos(anchorRef.current, null, { fallbackHeight: 140, leftOffset: -60 }));
  }, [anchorRef]);

  const save = async (newDate: string | null) => {
    const res = await fetch("/api/admin/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: payoutId, payDistributedDate: newDate }),
    });
    if (res.ok) onChanged();
    onClose();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] w-52 rounded-lg border border-border bg-popover shadow-lg p-3 animate-in fade-in-0 zoom-in-95 duration-100"
        style={{ top: pos.top, left: pos.left }}
      >
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Distribution Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs text-foreground"
        />
        <div className="flex justify-between mt-2">
          {value && (
            <button
              onClick={() => save(null)}
              className="text-xs text-destructive hover:text-destructive/80 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => save(date || null)}
            disabled={!date}
            className="ml-auto text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Actions dropdown (portal)
// ---------------------------------------------------------------------------

function ActionsDropdown({
  payout,
  onEdit,
  onDelete,
  onViewDocs,
  onClose,
  anchorRef,
}: {
  payout: PayoutRecord;
  onEdit: (p: PayoutRecord) => void;
  onDelete: (id: string) => void;
  onViewDocs: (brandName: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= 140 ? rect.bottom + 4 : rect.top - 136;
    setPos({ top: Math.max(4, top), left: rect.right - 192 });
  }, [anchorRef]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] w-48 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
        style={{ top: pos.top, left: pos.left }}
      >
        <button
          onClick={() => {
            onClose();
            onEdit(payout);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button
          onClick={() => {
            onClose();
            onViewDocs(payout.brandName);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
        >
          <FileText className="h-3.5 w-3.5" /> Documents
        </button>
        <button
          onClick={() => {
            onClose();
            onDelete(payout.id);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </>,
    document.body
  );
}

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
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        aria-label="Payout actions"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <ActionsDropdown
          payout={payout}
          onEdit={onEdit}
          onDelete={onDelete}
          onViewDocs={onViewDocs}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border/50 dark:border-white/[0.06] bg-card p-6 shadow-xl mx-4">
        <h4 className="text-lg font-semibold text-foreground">Delete Payout</h4>
        <p className="text-sm text-muted-foreground mt-2">
          Are you sure you want to delete the payout for{" "}
          <span className="font-medium text-foreground">{brandName}</span>?
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-destructive hover:bg-destructive/90 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border/50 dark:border-white/[0.06] bg-card p-6 shadow-xl mx-4">
        <h4 className="text-sm font-semibold text-foreground">{brandName}</h4>
        <p className="text-xs text-muted-foreground mb-3">{label}</p>
        <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
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
          <div
            key={i}
            className="h-16 rounded-xl bg-muted/50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (payouts.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-12 text-center">
        <p className="text-muted-foreground text-sm">
          No payouts for this month.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 dark:border-white/[0.06] bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Brand
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  <SortHeader
                    label="Joined"
                    active={true}
                    direction={dateSort}
                    onToggle={() => setDateSort(dateSort === "asc" ? "desc" : "asc")}
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Vertical
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  POC
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Service
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Due
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Paid
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Sales Rep
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Referral
                </th>
                <th className="text-center px-2 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Split
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Signed
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Paid
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Slack
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Distributed
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Dist. Date
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Notes
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Docs
                </th>
                <th className="px-2 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const underpaid = !p.isPaid && p.amountDue > p.amountPaid;
                return (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-border/50 dark:border-white/[0.06] last:border-0 transition-colors",
                    underpaid
                      ? "bg-red-50/60 hover:bg-red-50 dark:bg-red-500/[0.07] dark:hover:bg-red-500/[0.12]"
                      : "hover:bg-muted/20"
                  )}
                >
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                    {p.brandName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(p.dateJoined)}
                  </td>
                  <td className="px-4 py-3">
                    <VerticalBadge
                      value={p.vertical}
                      payoutId={p.id}
                      options={verticalOptions}
                      onChanged={onRefresh}
                      onVerticalsChanged={onVerticalsChanged}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {p.pointOfContact ? (
                      <button
                        onClick={() => setPocId(p.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-sky-500 hover:bg-sky-500/10 transition-colors"
                      >
                        <UserCircle className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground/40">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {p.service ? (
                      <button
                        onClick={() => setServiceId(p.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-violet-500 hover:bg-violet-500/10 transition-colors"
                      >
                        <Briefcase className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground/40">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap">
                    {formatCents(p.amountDue)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap">
                    {formatCents(p.amountPaid)}
                  </td>
                  <td className="px-4 py-3">
                    <SalesRepBadge
                      value={p.salesRep}
                      payoutId={p.id}
                      options={salesRepOptions}
                      onChanged={onRefresh}
                      onSalesRepsChanged={onSalesRepsChanged}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <ReferralBadge
                      value={p.referral}
                      pct={p.referralPct}
                      payoutId={p.id}
                      options={referralOptions}
                      onChanged={onRefresh}
                      onReferralsChanged={onReferralsChanged}
                    />
                  </td>
                  <td className="px-2 py-3 text-center">
                    {p.commissionSplit && p.splitDetails.length > 0 ? (
                      <button
                        onClick={() => onEdit(p)}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 hover:opacity-80 transition-opacity"
                        title={p.splitDetails.map((s) => `${s.name}: ${s.pct}%`).join(", ")}
                      >
                        <GitBranch className="h-3 w-3" />
                        {p.splitDetails.length}
                      </button>
                    ) : (
                      <span className="text-muted-foreground/40">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ToggleBadge
                      value={p.isSigned}
                      payoutId={p.id}
                      field="isSigned"
                      onToggled={onRefresh}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ToggleBadge
                      value={p.isPaid}
                      payoutId={p.id}
                      field="isPaid"
                      onToggled={onRefresh}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ToggleBadge
                      value={p.addedToSlack}
                      payoutId={p.id}
                      field="addedToSlack"
                      onToggled={onRefresh}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <PayDistributedBadge
                      value={p.payDistributed}
                      payoutId={p.id}
                      onChanged={onRefresh}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <DistDateCell
                      value={p.payDistributedDate}
                      payoutId={p.id}
                      onChanged={onRefresh}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {p.paymentNotes ? (
                      <button
                        onClick={() => setNotesId(p.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-amber-500 hover:bg-amber-500/10 transition-colors"
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground/40">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => onViewDocs(p.brandName)}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-blue-500 hover:bg-blue-500/10 transition-colors"
                      title="View documents"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="px-2 py-3">
                    <ActionsCell
                      payout={p}
                      onEdit={onEdit}
                      onDelete={setDeleteId}
                      onViewDocs={onViewDocs}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {sorted.map((p) => {
          const underpaid = !p.isPaid && p.amountDue > p.amountPaid;
          return (
          <div
            key={p.id}
            className={cn(
              "rounded-lg border p-4",
              underpaid
                ? "border-red-200 dark:border-red-500/20 bg-red-50/60 dark:bg-red-500/[0.07]"
                : "border-border/50 dark:border-white/[0.06] bg-background/50"
            )}
          >
            {/* Top: Brand + date + actions */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm truncate">
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
                <div className="flex items-center gap-2 mt-0.5">
                  {p.pointOfContact && (
                    <button
                      onClick={() => setPocId(p.id)}
                      className="inline-flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600 transition-colors"
                    >
                      <UserCircle className="h-3 w-3" />
                      View POC
                    </button>
                  )}
                  {p.service && (
                    <button
                      onClick={() => setServiceId(p.id)}
                      className="inline-flex items-center gap-1 text-xs text-violet-500 hover:text-violet-600 transition-colors"
                    >
                      <Briefcase className="h-3 w-3" />
                      View Service
                    </button>
                  )}
                  <button
                    onClick={() => onViewDocs(p.brandName)}
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
                  >
                    <FileText className="h-3 w-3" />
                    Docs
                  </button>
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
                <span className="font-semibold text-foreground text-sm">
                  {formatCents(p.amountDue)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Paid</span>
                <span className="font-semibold text-foreground text-sm">
                  {formatCents(p.amountPaid)}
                </span>
              </div>
            </div>

            {/* Sales Rep */}
            <div className="flex items-center gap-1 mb-3 min-w-0">
              <span className="text-[10px] text-muted-foreground shrink-0">Rep</span>
              <div className="min-w-0 truncate text-xs text-muted-foreground">
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
                <div className="min-w-0 truncate text-xs text-muted-foreground">
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
                  <button
                    onClick={() => onEdit(p)}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                  >
                    <GitBranch className="h-3 w-3" />
                    {p.splitDetails.length}
                  </button>
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
              <div className="mt-3 pt-3 border-t border-border/50 dark:border-white/[0.06] flex items-center gap-1.5">
                <button
                  onClick={() => setNotesId(p.id)}
                  className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 transition-colors"
                >
                  <StickyNote className="h-3 w-3" />
                  View Notes
                </button>
              </div>
            )}
          </div>
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
