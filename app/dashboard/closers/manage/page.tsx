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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
    <DashboardShell wide>
      {/* Extra bottom room on phones so the FAB never covers the pagination. */}
      <div className="space-y-6 pb-16 md:pb-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">
              Closers Management
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your sales team members
            </p>
          </div>
          <Button onClick={openCreate} className="hidden md:inline-flex">
            <Plus />
            Add New Closer
          </Button>
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
        <Button
          onClick={openCreate}
          aria-label="Add new closer"
          size="icon-lg"
          className="md:hidden fixed bottom-20 right-4 z-30 size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
        >
          <Plus />
        </Button>

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-4" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search skeleton */}
      <div className="flex gap-3">
        <Skeleton className="flex-1 h-9 rounded-3xl" />
        <Skeleton className="w-48 h-8 rounded-3xl" />
      </div>

      {/* Table skeleton */}
      <Card>
        <div className="h-12 border-b" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b last:border-0"
          >
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </Card>
    </div>
  );
}
