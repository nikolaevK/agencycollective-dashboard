"use client";

import { useState, useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, Plus, Calendar, ChevronDown, FileDown } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { MonthYearSelector } from "@/components/payouts/MonthYearSelector";
import { PayoutSummaryCards } from "@/components/payouts/PayoutSummaryCards";
import type { MetricCardType } from "@/components/payouts/PayoutSummaryCards";
import { PayoutTable } from "@/components/payouts/PayoutTable";
import { AddEditPayoutModal } from "@/components/payouts/AddEditPayoutModal";
import type { SourceDealPrefill } from "@/components/payouts/AddEditPayoutModal";
import { ImportDealModal } from "@/components/payouts/ImportDealModal";
import type { ImportableDeal } from "@/components/payouts/ImportDealModal";
import { RebillDetailModal } from "@/components/payouts/RebillDetailModal";
import { BrandDocumentsModal } from "@/components/payouts/BrandDocumentsModal";
import { PayoutRevenueMixChart } from "@/components/payouts/PayoutRevenueMixChart";
import { PayoutConcentrationCard, PayoutSalesRepCard } from "@/components/payouts/PayoutBreakdownCards";
import type {
  PayoutRecord,
  PayoutSummary,
  RebillMetrics,
  ForecastData,
  PayoutTrends,
} from "@/lib/payouts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type PaidFilter = "all" | "paid" | "unpaid";
type PayoutView = "payouts" | "insights";

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
      <Popover
        open={open}
        onOpenChange={(next) => (next ? onToggle() : onClose())}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full md:w-auto justify-start",
              hasFilter && "border-primary/50 bg-primary/5"
            )}
          >
            <Calendar className="text-muted-foreground" />
            <span className="truncate">{dateLabel(dateFrom, dateTo)}</span>
            <ChevronDown
              className={cn(
                "text-muted-foreground transition-transform ml-auto",
                open && "rotate-180"
              )}
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] md:w-72 p-0"
          // The old dropdown didn't close on Escape.
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="p-1.5">
            <p className="px-3 py-2 text-xs font-medium text-muted-foreground">
              Presets
            </p>
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                onClick={() => onSelectPreset(preset.from, preset.to, preset.label)}
                className={cn(
                  "w-full justify-start font-normal",
                  dateFrom === preset.from &&
                    dateTo === preset.to &&
                    "bg-muted font-medium"
                )}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="border-t p-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCustom}
              className="w-full justify-between"
            >
              Custom range
              <ChevronDown
                className={cn(
                  "size-3 transition-transform",
                  showCustom && "rotate-180"
                )}
              />
            </Button>

            {showCustom && (
              <div className="mt-2 space-y-3 px-1.5 pb-1.5">
                <div className="grid gap-2">
                  <Label htmlFor="payout-date-from" className="text-xs text-muted-foreground">
                    From
                  </Label>
                  <DatePicker
                    id="payout-date-from"
                    value={customFrom}
                    onValueChange={onCustomFrom}
                    max={customTo || undefined}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payout-date-to" className="text-xs text-muted-foreground">
                    To
                  </Label>
                  <DatePicker
                    id="payout-date-to"
                    value={customTo}
                    onValueChange={onCustomTo}
                    min={customFrom || undefined}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={onApplyCustom}
                  disabled={!customFrom || !customTo || customFrom > customTo}
                  className="w-full"
                >
                  Apply
                </Button>
              </div>
            )}
          </div>

          {hasFilter && (
            <div className="border-t p-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Clear date filter
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
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
  const [importPickerOpen, setImportPickerOpen] = useState(false);
  const [sourceDeal, setSourceDeal] = useState<SourceDealPrefill | null>(null);
  const [rebillModalOpen, setRebillModalOpen] = useState(false);
  const [rebillModalView, setRebillModalView] = useState<MetricCardType>("new");
  const [docsModalBrand, setDocsModalBrand] = useState<string | null>(null);
  const [view, setView] = useState<PayoutView>("payouts");

  const queryClient = useQueryClient();

  const { data: salesRepOptions = [] } = useQuery<string[]>({
    queryKey: ["sales-rep-options"],
    queryFn: async () => {
      const res = await fetch("/api/admin/payouts/sales-reps");
      if (!res.ok) throw new Error("Failed to fetch sales rep options");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  const refreshSalesReps = () => {
    queryClient.invalidateQueries({ queryKey: ["sales-rep-options"] });
  };

  const { data: verticalOptions = [] } = useQuery<string[]>({
    queryKey: ["vertical-options"],
    queryFn: async () => {
      const res = await fetch("/api/admin/payouts/verticals");
      if (!res.ok) throw new Error("Failed to fetch vertical options");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  const refreshVerticals = () => {
    queryClient.invalidateQueries({ queryKey: ["vertical-options"] });
  };

  const { data: referralOptions = [] } = useQuery<string[]>({
    queryKey: ["referral-options"],
    queryFn: async () => {
      const res = await fetch("/api/admin/payouts/referrals");
      if (!res.ok) throw new Error("Failed to fetch referral options");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  const refreshReferrals = () => {
    queryClient.invalidateQueries({ queryKey: ["referral-options"] });
  };

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

  const {
    data: rebillData,
    isLoading: rebillLoading,
  } = useQuery<{ metrics: RebillMetrics; forecast: ForecastData }>({
    queryKey: ["admin-payouts-rebill", month, year],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/payouts/rebill-metrics?month=${month}&year=${year}`
      );
      if (!res.ok) throw new Error("Failed to fetch rebill metrics");
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
  });

  // 12 months ending with the selected month: card trend lines + Insights.
  const { data: trends, isError: trendsError } = useQuery<PayoutTrends>({
    queryKey: ["admin-payouts-trends", month, year],
    queryFn: async () => {
      const res = await fetch(`/api/admin/payouts/trends?month=${month}&year=${year}`);
      if (!res.ok) throw new Error("Failed to fetch payout trends");
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
    // Keep the lines on screen while another month loads (no layout jump).
    placeholderData: keepPreviousData,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-payouts", month, year] });
    queryClient.invalidateQueries({
      queryKey: ["admin-payouts-summary", month, year],
    });
    queryClient.invalidateQueries({
      queryKey: ["admin-payouts-rebill", month, year],
    });
    // Every cached 12-month window containing this month, not just this one.
    queryClient.invalidateQueries({ queryKey: ["admin-payouts-trends"] });
    // Keep the deal importer in sync — a just-imported deal must show as "Imported".
    queryClient.invalidateQueries({ queryKey: ["importable-deals"] });
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
    setSourceDeal(null);
    setModalOpen(true);
  };

  const handleImportClick = () => {
    setEditingPayout(null);
    setSourceDeal(null);
    setImportPickerOpen(true);
  };

  const handlePickDeal = (deal: ImportableDeal) => {
    const dollars = (deal.dealValue / 100).toString();
    // Only carry a close date the form can parse into month/year; a malformed
    // value would otherwise derive NaN and bounce off the server as a 400.
    const closeDate = deal.closingDate ?? "";
    const dateJoined = /^\d{4}-\d{2}-\d{2}/.test(closeDate) ? closeDate.slice(0, 10) : "";
    setSourceDeal({
      dealId: deal.dealId,
      brandName: deal.brandName || deal.clientName,
      pointOfContact: deal.clientName,
      service: deal.serviceCategory ?? "",
      vertical: deal.industry ?? "",
      dateJoined,
      amountDue: dollars,
      amountPaid: deal.paidStatus === "paid" ? dollars : "",
      isSigned: deal.isSigned,
      isPaid: deal.paidStatus === "paid",
      paymentNotes: deal.notes ?? "",
      salesRep: deal.closerName ?? "",
    });
    setEditingPayout(null);
    setImportPickerOpen(false);
    setModalOpen(true);
  };

  return (
    <DashboardShell wide>
      {/* pb-28 on phones: the stacked FABs (bottom-20 → 9.25rem + 3rem) would
          otherwise sit over the last payout card when scrolled to the end. */}
      <div className="space-y-6 pb-28 md:pb-0">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">
              Payout Tracker
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Track client payments, onboarding status, and sales rep
              distributions
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Button variant="outline" onClick={handleImportClick}>
              <FileDown />
              Import from Deal
            </Button>
            <Button onClick={handleAdd}>
              <Plus />
              Add Payout
            </Button>
          </div>
        </div>

        <CloserSubNav />

        {/* Month selector */}
        <MonthYearSelector
          month={month}
          year={year}
          onChange={handleMonthChange}
        />

        {/* Summary cards */}
        <PayoutSummaryCards
          summary={summary}
          isLoading={summaryLoading}
          rebillMetrics={rebillData?.metrics}
          forecast={rebillData?.forecast}
          rebillLoading={rebillLoading}
          trends={trends}
          monthName={format(new Date(year, month - 1, 1), "MMMM")}
          onCardClick={(card) => {
            setRebillModalView(card);
            setRebillModalOpen(true);
          }}
        />

        {/* Panels inherit the page's type (TabsContent defaults to text-sm). */}
        <Tabs value={view} onValueChange={(v) => setView(v as PayoutView)} className="space-y-6">
          <TabsList>
            <TabsTrigger value="payouts">Ledger</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="text-[length:inherit] leading-[inherit]">
            {trends ? (
              <div className="space-y-6">
                <PayoutRevenueMixChart months={trends.months} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <PayoutConcentrationCard
                    brands={trends.brands}
                    monthLabel={format(new Date(year, month - 1, 1), "MMMM yyyy")}
                  />
                  <PayoutSalesRepCard
                    reps={trends.salesReps}
                    monthLabel={format(new Date(year, month - 1, 1), "MMMM yyyy")}
                  />
                </div>
              </div>
            ) : trendsError ? (
              <Card>
                <CardContent className="p-12 md:p-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Couldn&apos;t load insights. Try again in a moment.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Skeleton className="h-[380px] w-full rounded-3xl" />
            )}
          </TabsContent>

          {/* Kept mounted while Insights is open: switching back doesn't
              rebuild the table or reset its state. */}
          <TabsContent
            value="payouts"
            forceMount
            className="space-y-6 text-[length:inherit] leading-[inherit] data-[state=inactive]:hidden"
          >
            {/* Search + filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by brand name..."
                  className="pl-9"
                />
              </div>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={paidFilter}
                // Radix reports "" when the active pill is clicked again; the
                // old pills just re-selected it, so ignore that.
                onValueChange={(v) => {
                  if (v) setPaidFilter(v as PaidFilter);
                }}
                aria-label="Payment status"
                className="overflow-x-auto"
              >
                {paidFilters.map((f) => (
                  <ToggleGroupItem key={f.value} value={f.value} className="px-3">
                    {f.label} ({f.count})
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
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
              onViewDocs={setDocsModalBrand}
              onRefresh={refresh}
              salesRepOptions={salesRepOptions}
              onSalesRepsChanged={refreshSalesReps}
              verticalOptions={verticalOptions}
              onVerticalsChanged={refreshVerticals}
              referralOptions={referralOptions}
              onReferralsChanged={refreshReferrals}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Mobile FABs */}
      <Button
        variant="outline"
        size="icon-lg"
        onClick={handleImportClick}
        aria-label="Import from deal"
        title="Import from Deal"
        className="md:hidden fixed bottom-[9.25rem] right-4 z-30 size-12 rounded-full shadow-lg"
      >
        <FileDown className="size-5" />
      </Button>
      <Button
        size="icon-lg"
        onClick={handleAdd}
        aria-label="Add payout"
        title="Add Payout"
        className="md:hidden fixed bottom-20 right-4 z-30 size-14 rounded-full shadow-lg"
      >
        <Plus className="size-6" />
      </Button>

      {/* Deal importer (picker) */}
      <ImportDealModal
        open={importPickerOpen}
        onClose={() => setImportPickerOpen(false)}
        onPick={handlePickDeal}
      />

      {/* Add/Edit modal */}
      <AddEditPayoutModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingPayout(null);
          setSourceDeal(null);
        }}
        onSaved={refresh}
        payout={editingPayout}
        sourceDeal={sourceDeal}
        defaultMonth={month}
        defaultYear={year}
        salesRepOptions={salesRepOptions}
        onSalesRepsChanged={refreshSalesReps}
        verticalOptions={verticalOptions}
        onVerticalsChanged={refreshVerticals}
        referralOptions={referralOptions}
        onReferralsChanged={refreshReferrals}
      />

      <RebillDetailModal
        open={rebillModalOpen}
        onClose={() => setRebillModalOpen(false)}
        view={rebillModalView}
        metrics={rebillData?.metrics}
        forecast={rebillData?.forecast}
        month={month}
        year={year}
      />

      {docsModalBrand && (
        <BrandDocumentsModal
          open={!!docsModalBrand}
          onClose={() => setDocsModalBrand(null)}
          brandName={docsModalBrand}
          defaultMonth={month}
          defaultYear={year}
        />
      )}
    </DashboardShell>
  );
}
