"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Calendar, ChevronDown } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { MonthYearSelector } from "@/components/payouts/MonthYearSelector";
import { PayoutSummaryCards } from "@/components/payouts/PayoutSummaryCards";
import { PayoutTable } from "@/components/payouts/PayoutTable";
import { AddEditPayoutModal } from "@/components/payouts/AddEditPayoutModal";
import type { PayoutRecord, PayoutSummary } from "@/lib/payouts";
import { cn } from "@/lib/utils";

type PaidFilter = "all" | "paid" | "unpaid";

/* ── Date presets relative to today ─────────────────────────────── */
function getDatePresets() {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const sub = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return fmt(d);
  };
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

  return [
    { label: "Last 7 days", from: sub(6), to: fmt(today) },
    { label: "Last 14 days", from: sub(13), to: fmt(today) },
    { label: "Last 30 days", from: sub(29), to: fmt(today) },
    { label: "This month", from: fmt(startOfMonth), to: fmt(today) },
    { label: "Last month", from: fmt(startOfLastMonth), to: fmt(endOfLastMonth) },
  ];
}

function dateLabel(from: string, to: string): string {
  if (!from && !to) return "Date Joined";
  const presets = getDatePresets();
  const match = presets.find((p) => p.from === from && p.to === to);
  if (match) return match.label;
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  return `To ${to}`;
}

/* ── Date picker dropdown (matches DateRangePicker pattern) ─────── */
function DateJoinedPicker({
  dateFrom,
  dateTo,
  open,
  showCustom,
  customFrom,
  customTo,
  onToggle,
  onClose,
  onToggleCustom,
  onCustomFrom,
  onCustomTo,
  onApplyCustom,
  onSelectPreset,
  onClear,
}: {
  dateFrom: string;
  dateTo: string;
  open: boolean;
  showCustom: boolean;
  customFrom: string;
  customTo: string;
  onToggle: () => void;
  onClose: () => void;
  onToggleCustom: () => void;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
  onApplyCustom: () => void;
  onSelectPreset: (from: string, to: string, label: string) => void;
  onClear: () => void;
}) {
  const hasFilter = dateFrom || dateTo;
  const presets = getDatePresets();

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full md:w-auto items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
          hasFilter
            ? "border-primary/50 bg-primary/5 text-primary"
            : "bg-background text-foreground"
        )}
      >
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate">{dateLabel(dateFrom, dateTo)}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform shrink-0 ml-auto",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />

          <div className="absolute left-0 right-0 md:left-auto md:right-auto md:w-72 top-full z-20 mt-2 rounded-lg border bg-popover shadow-lg">
            <div className="p-2">
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Presets
              </p>
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => onSelectPreset(preset.from, preset.to, preset.label)}
                  className={cn(
                    "flex w-full items-center rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent",
                    dateFrom === preset.from &&
                      dateTo === preset.to &&
                      "bg-primary/10 text-primary font-medium"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="border-t p-2">
              <button
                onClick={onToggleCustom}
                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                Custom range
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showCustom && "rotate-180"
                  )}
                />
              </button>

              {showCustom && (
                <div className="mt-2 space-y-2 px-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-muted-foreground">
                        From
                      </label>
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => onCustomFrom(e.target.value)}
                        max={customTo || undefined}
                        className="w-full rounded border bg-background px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-muted-foreground">
                        To
                      </label>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => onCustomTo(e.target.value)}
                        min={customFrom || undefined}
                        className="w-full rounded border bg-background px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                  <button
                    onClick={onApplyCustom}
                    disabled={!customFrom || !customTo || customFrom > customTo}
                    className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>

            {hasFilter && (
              <div className="border-t p-2">
                <button
                  onClick={onClear}
                  className="flex w-full items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Clear date filter
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function PayoutsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPayout, setEditingPayout] = useState<PayoutRecord | null>(null);

  const queryClient = useQueryClient();

  const {
    data: payouts = [],
    isLoading,
  } = useQuery<PayoutRecord[]>({
    queryKey: ["admin-payouts", month, year],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/payouts?month=${month}&year=${year}`
      );
      if (!res.ok) throw new Error("Failed to fetch payouts");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: summary, isLoading: summaryLoading } =
    useQuery<PayoutSummary>({
      queryKey: ["admin-payouts-summary", month, year],
      queryFn: async () => {
        const res = await fetch(
          `/api/admin/payouts/summary?month=${month}&year=${year}`
        );
        if (!res.ok) throw new Error("Failed to fetch summary");
        const json = await res.json();
        return json.data;
      },
      staleTime: 30_000,
    });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-payouts", month, year] });
    queryClient.invalidateQueries({
      queryKey: ["admin-payouts-summary", month, year],
    });
  };

  // Counts for filter pills
  const paidCount = payouts.filter((p) => p.isPaid).length;
  const unpaidCount = payouts.filter((p) => !p.isPaid).length;

  const paidFilters: { value: PaidFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: payouts.length },
    { value: "paid", label: "Paid", count: paidCount },
    { value: "unpaid", label: "Unpaid", count: unpaidCount },
  ];

  // Apply filters
  const filtered = useMemo(() => {
    let result = payouts;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((p) =>
        p.brandName.toLowerCase().includes(q)
      );
    }

    if (paidFilter === "paid") {
      result = result.filter((p) => p.isPaid);
    } else if (paidFilter === "unpaid") {
      result = result.filter((p) => !p.isPaid);
    }

    if (dateFrom) {
      result = result.filter(
        (p) => p.dateJoined && p.dateJoined >= dateFrom
      );
    }
    if (dateTo) {
      result = result.filter(
        (p) => p.dateJoined && p.dateJoined <= dateTo
      );
    }

    return result;
  }, [payouts, search, paidFilter, dateFrom, dateTo]);

  const handleMonthChange = (m: number, y: number) => {
    setMonth(m);
    setYear(y);
  };

  const handleEdit = (payout: PayoutRecord) => {
    setEditingPayout(payout);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditingPayout(null);
    setModalOpen(true);
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl lg:text-3xl font-black text-foreground">
              Payout Tracker
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Track client payments, onboarding status, and sales rep
              distributions
            </p>
          </div>
          <button
            onClick={handleAdd}
            className={cn(
              "hidden md:inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all",
              "ac-gradient shadow-lg shadow-primary/20"
            )}
          >
            <Plus className="h-4 w-4" />
            Add Payout
          </button>
        </div>

        <CloserSubNav />

        {/* Month selector */}
        <MonthYearSelector
          month={month}
          year={year}
          onChange={handleMonthChange}
        />

        {/* Summary cards */}
        <PayoutSummaryCards summary={summary} isLoading={summaryLoading} />

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by brand name..."
              className="flex h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
            />
          </div>
          <div className="flex gap-1 rounded-lg bg-muted/50 dark:bg-white/5 p-1 overflow-x-auto">
            {paidFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setPaidFilter(f.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                  paidFilter === f.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        </div>

        {/* Date filter dropdown */}
        <div className="flex flex-col sm:flex-row gap-3">
          <DateJoinedPicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            open={dateOpen}
            showCustom={showCustomDate}
            customFrom={customFrom}
            customTo={customTo}
            onToggle={() => setDateOpen(!dateOpen)}
            onClose={() => setDateOpen(false)}
            onToggleCustom={() => setShowCustomDate(!showCustomDate)}
            onCustomFrom={setCustomFrom}
            onCustomTo={setCustomTo}
            onApplyCustom={() => {
              if (customFrom && customTo && customFrom <= customTo) {
                setDateFrom(customFrom);
                setDateTo(customTo);
                setDateOpen(false);
              }
            }}
            onSelectPreset={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
              setShowCustomDate(false);
              setDateOpen(false);
            }}
            onClear={() => {
              setDateFrom("");
              setDateTo("");
              setCustomFrom("");
              setCustomTo("");
              setDateOpen(false);
            }}
          />
        </div>

        {/* Table */}
        <PayoutTable
          payouts={filtered}
          isLoading={isLoading}
          onEdit={handleEdit}
          onRefresh={refresh}
        />
      </div>

      {/* Mobile FAB */}
      <button
        onClick={handleAdd}
        className="md:hidden fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full ac-gradient text-white shadow-lg hover:opacity-90 transition-opacity"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Add/Edit modal */}
      <AddEditPayoutModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingPayout(null);
        }}
        onSaved={refresh}
        payout={editingPayout}
        defaultMonth={month}
        defaultYear={year}
      />
    </DashboardShell>
  );
}
