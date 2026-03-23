"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { CloserManageMetrics } from "@/components/closers/CloserManageMetrics";
import { CloserSearchFilter } from "@/components/closers/CloserSearchFilter";
import { CloserTable } from "@/components/closers/CloserTable";
import { CloserCardList } from "@/components/closers/CloserCardList";
import { CloserPagination } from "@/components/closers/CloserPagination";
import { AddEditCloserModal } from "@/components/closers/AddEditCloserModal";
import { AddEditCloserMobile } from "@/components/closers/AddEditCloserMobile";
import type { CloserPublic } from "@/components/closers/types";

export default function ClosersManagePage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editCloser, setEditCloser] = useState<CloserPublic | undefined>(
    undefined
  );

  const perPage = 10;

  const { data: closers = [], isLoading } = useQuery<CloserPublic[]>({
    queryKey: ["admin-closers"],
    queryFn: () =>
      fetch("/api/admin/closers")
        .then((r) => r.json())
        .then((d) => d.data ?? []),
    staleTime: 30_000,
  });

  // Client-side search, filter, and pagination
  const filtered = useMemo(() => {
    let result = closers;

    // Filter by status
    if (filter !== "all") {
      result = result.filter((c) => c.status === filter);
    }

    // Search by name or email
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }

    return result;
  }, [closers, filter, search]);

  const total = filtered.length;
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // Reset to page 1 when filters change
  function handleSetSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  function handleSetFilter(v: "all" | "active" | "inactive") {
    setFilter(v);
    setPage(1);
  }

  function openCreate() {
    setEditCloser(undefined);
    setShowModal(true);
  }

  function openEdit(closer: CloserPublic) {
    setEditCloser(closer);
    setShowModal(true);
  }

  function handleClose() {
    setShowModal(false);
    setEditCloser(undefined);
  }

  function handleSaved() {
    setShowModal(false);
    setEditCloser(undefined);
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl lg:text-3xl font-black text-foreground">
              Closers Management
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your sales team members
            </p>
          </div>
          <button
            onClick={openCreate}
            className="hidden md:inline-flex items-center gap-2 h-9 rounded-lg ac-gradient px-4 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add New Closer
          </button>
        </div>

        <CloserSubNav />

        {isLoading ? (
          <ManageSkeleton />
        ) : (
          <>
            <CloserManageMetrics closers={closers} />

            <CloserSearchFilter
              search={search}
              setSearch={handleSetSearch}
              filter={filter}
              setFilter={handleSetFilter}
            />

            {/* Desktop Table */}
            <div className="hidden md:block">
              <CloserTable closers={paginated} onEdit={openEdit} />
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden">
              <CloserCardList closers={paginated} onEdit={openEdit} />
            </div>

            <CloserPagination
              page={page}
              setPage={setPage}
              total={total}
              perPage={perPage}
            />
          </>
        )}

        {/* Mobile FAB */}
        <button
          onClick={openCreate}
          className="md:hidden fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full ac-gradient text-white shadow-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-6 w-6" />
        </button>

        {/* Desktop Modal */}
        {showModal && (
          <div className="hidden md:block">
            <AddEditCloserModal
              closer={editCloser}
              onClose={handleClose}
              onSaved={handleSaved}
            />
          </div>
        )}

        {/* Mobile Full-Screen Form */}
        {showModal && (
          <div className="md:hidden">
            <AddEditCloserMobile
              closer={editCloser}
              onClose={handleClose}
              onSaved={handleSaved}
            />
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function ManageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Metrics skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg animate-pulse bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="h-6 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search skeleton */}
      <div className="flex gap-3">
        <div className="flex-1 h-10 rounded-lg animate-pulse bg-muted" />
        <div className="w-48 h-10 rounded-lg animate-pulse bg-muted" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
        <div className="h-10 border-b border-border/50 bg-muted/30" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b border-border/50 dark:border-white/[0.06] last:border-0"
          >
            <div className="w-9 h-9 rounded-full animate-pulse bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-44 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
