"use client";

import { useState, useTransition, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAdmin } from "@/components/providers/AdminProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { AdminStatsRow } from "@/components/admins/AdminStatsRow";
import { AdminTable } from "@/components/admins/AdminTable";
import { AdminCardList } from "@/components/admins/AdminCardList";
import { AdminSearchFilter, type AdminFilter } from "@/components/admins/AdminSearchFilter";
import { AdminPagination } from "@/components/admins/AdminPagination";
import { AuditLogCard } from "@/components/admins/AuditLogCard";
import { AccessPolicyCard } from "@/components/admins/AccessPolicyCard";
import type { AdminPublic } from "@/components/admins/types";
import type { AdminPermissions } from "@/lib/permissions";
import { uploadAdminAvatar } from "@/app/actions/adminActions";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/use-confirm";

// Lazy: click-to-open forms (Selects, Switches, Checkboxes, Radix Dialog)
// stay out of the page's first load.
const AddEditAdminModal = dynamic(
  () => import("@/components/admins/AddEditAdminModal").then((m) => m.AddEditAdminModal),
  { ssr: false }
);
const AddEditAdminMobile = dynamic(
  () => import("@/components/admins/AddEditAdminMobile").then((m) => m.AddEditAdminMobile),
  { ssr: false }
);
const WorkspaceManagerModal = dynamic(
  () => import("@/components/admins/WorkspaceManagerModal").then((m) => m.WorkspaceManagerModal),
  { ssr: false }
);

const PAGE_SIZE = 10;

async function fetchAdmins(): Promise<AdminPublic[]> {
  const res = await fetch("/api/admin/admins");
  if (!res.ok) throw new Error("Failed to fetch admins");
  const json = await res.json();
  return json.data;
}

export function AdminsPanel() {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const { toastError } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data: admins = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admins"],
    queryFn: fetchAdmins,
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminFilter>("all");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminPublic | null>(null);
  const [isPending, startTransition] = useTransition();

  const canMutate = admin.isSuper;

  // Filter and search
  const filtered = useMemo(() => {
    let list = admins;
    if (filter === "super") list = list.filter((a) => a.isSuper);
    if (filter === "standard") list = list.filter((a) => !a.isSuper);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.username.toLowerCase().includes(q) ||
          (a.displayName?.toLowerCase().includes(q)) ||
          (a.email?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [admins, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Stats
  const superCount = admins.filter((a) => a.isSuper).length;

  function openModal(a: AdminPublic | null) {
    setSelectedAdmin(a);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedAdmin(null);
  }

  const [workspacesOpen, setWorkspacesOpen] = useState(false);

  function handleSave(data: {
    id?: string;
    username?: string;
    displayName: string;
    email: string;
    role: string;
    permissions: AdminPermissions;
    workspaces?: string[] | null;
    avatarFile?: File;
  }) {
    startTransition(async () => {
      try {
        const isEdit = Boolean(data.id);
        const method = isEdit ? "PATCH" : "POST";
        const body: Record<string, unknown> = {
          displayName: data.displayName || null,
          email: data.email || null,
          role: data.role,
          permissions: data.permissions,
        };
        if (data.workspaces !== undefined) body.workspaces = data.workspaces;
        if (isEdit) body.id = data.id;
        else body.username = data.username;

        const res = await fetch("/api/admin/admins", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const json = await res.json();
          toastError(json.error ?? "Failed to save admin");
          return;
        }

        const result = await res.json();
        const adminId = result.data?.id ?? data.id ?? data.username;

        // Upload avatar if file was selected
        if (data.avatarFile && adminId) {
          const fd = new FormData();
          fd.append("adminId", adminId);
          fd.append("avatar", data.avatarFile);
          await uploadAdminAvatar(fd);
        }

        queryClient.invalidateQueries({ queryKey: ["admins"] });
        closeModal();
      } catch {
        toastError("An error occurred");
      }
    });
  }

  async function handleDelete(id: string) {
    const target = admins.find((a) => a.id === id);
    const ok = await confirm({
      title: "Delete this admin?",
      description: `Are you sure you want to delete ${
        target ? `"${target.displayName || target.username}"` : "this admin"
      }? This removes their dashboard access.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await fetch(`/api/admin/admins?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["admins"] });
    });
  }

  return (
    <DashboardShell>
      {/* Extra bottom room on phones so the FAB never covers the pagination. */}
      <div className="space-y-6 pb-16 md:pb-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">Admin Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage admin accounts, permissions, and monitor activity.
            </p>
          </div>
          {canMutate && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setWorkspacesOpen(true)}>
                <Boxes />
                Workspaces
              </Button>
              <Button onClick={() => openModal(null)} className="hidden md:inline-flex">
                <Plus />
                Add Admin
              </Button>
            </div>
          )}
        </div>

        {/* Stats row (desktop) */}
        <div className="hidden md:block">
          <AdminStatsRow
            totalAdmins={admins.length}
            superAdmins={superCount}
            recentChanges={0}
          />
        </div>

        {/* Main layout: the list gets the full width (13 permission tiles +
            role + password need it); policy + activity sit below it. */}
        <div className="flex flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-4">
            <AdminSearchFilter
              search={search}
              onSearchChange={(v) => { setSearch(v); setPage(1); }}
              filter={filter}
              onFilterChange={(f) => { setFilter(f); setPage(1); }}
            />

            {isLoading ? (
              <AdminListSkeleton />
            ) : isError ? (
              <QueryErrorState title="Couldn't load admins" onRetry={() => refetch()} />
            ) : (
              <>
                {/* Desktop table */}
                <AdminTable
                  admins={paginated}
                  canMutate={canMutate}
                  onEdit={(a) => openModal(a)}
                  onDelete={handleDelete}
                  isPending={isPending}
                />

                {/* Mobile card list */}
                <AdminCardList
                  admins={paginated}
                  canMutate={canMutate}
                  onEdit={(a) => openModal(a)}
                />

                <AdminPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>

          {/* Policy + activity (desktop only) */}
          <div className="hidden md:grid md:grid-cols-2 md:items-start gap-4">
            <AccessPolicyCard />
            <AuditLogCard />
          </div>
        </div>
      </div>

      {/* Mobile FAB */}
      {canMutate && (
        <Button
          onClick={() => openModal(null)}
          aria-label="Add admin"
          size="icon-lg"
          className="md:hidden fixed right-4 bottom-20 z-40 size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
        >
          <Plus />
        </Button>
      )}

      {workspacesOpen && <WorkspaceManagerModal onClose={() => setWorkspacesOpen(false)} />}

      {modalOpen && (
        <>
          {/* Desktop modal */}
          <AddEditAdminModal
            open={modalOpen}
            admin={selectedAdmin}
            onClose={closeModal}
            onSave={handleSave}
            isPending={isPending}
          />

          {/* Mobile full-screen form */}
          <AddEditAdminMobile
            open={modalOpen}
            admin={selectedAdmin}
            onClose={closeModal}
            onSave={handleSave}
            isPending={isPending}
          />
        </>
      )}

      {confirmDialog}
    </DashboardShell>
  );
}

function AdminListSkeleton() {
  return (
    <>
      <Card className="hidden md:block">
        <div className="h-12 border-b" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </Card>
      <div className="flex flex-col gap-3 md:hidden">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-5 w-48" />
          </Card>
        ))}
      </div>
    </>
  );
}
