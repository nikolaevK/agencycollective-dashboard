"use client";

import { useState, useTransition, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAdmin } from "@/components/providers/AdminProvider";
import { AdminStatsRow } from "@/components/admins/AdminStatsRow";
import { AdminTable } from "@/components/admins/AdminTable";
import { AdminCardList } from "@/components/admins/AdminCardList";
import { AdminSearchFilter, type AdminFilter } from "@/components/admins/AdminSearchFilter";
import { AdminPagination } from "@/components/admins/AdminPagination";
import { AddEditAdminModal } from "@/components/admins/AddEditAdminModal";
import { AddEditAdminMobile } from "@/components/admins/AddEditAdminMobile";
import { AuditLogCard } from "@/components/admins/AuditLogCard";
import { AccessPolicyCard } from "@/components/admins/AccessPolicyCard";
import type { AdminPublic } from "@/components/admins/types";
import type { AdminPermissions } from "@/lib/permissions";
import { uploadAdminAvatar } from "@/app/actions/adminActions";

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
  const { data: admins = [], isLoading } = useQuery({
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

  function handleSave(data: {
    id?: string;
    username?: string;
    displayName: string;
    email: string;
    role: string;
    permissions: AdminPermissions;
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
        if (isEdit) body.id = data.id;
        else body.username = data.username;

        const res = await fetch("/api/admin/admins", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const json = await res.json();
          alert(json.error ?? "Failed to save admin");
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
        alert("An error occurred");
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this admin?")) return;
    startTransition(async () => {
      await fetch(`/api/admin/admins?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["admins"] });
    });
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Admin Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage admin accounts, permissions, and monitor activity.
          </p>
        </div>

        {/* Stats row (desktop) */}
        <div className="hidden md:block">
          <AdminStatsRow
            totalAdmins={admins.length}
            superAdmins={superCount}
            recentChanges={0}
            onAddClick={() => openModal(null)}
            canAdd={canMutate}
          />
        </div>

        {/* Main layout: desktop 2/3 + 1/3 */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left column */}
          <div className="flex-1 space-y-4 min-w-0">
            <AdminSearchFilter
              search={search}
              onSearchChange={(v) => { setSearch(v); setPage(1); }}
              filter={filter}
              onFilterChange={(f) => { setFilter(f); setPage(1); }}
            />

            {isLoading ? (
              <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
                Loading...
              </div>
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

          {/* Right column (desktop only) */}
          <div className="hidden md:flex flex-col gap-4 w-80 shrink-0">
            <AccessPolicyCard />
            <AuditLogCard />
          </div>
        </div>
      </div>

      {/* Mobile FAB */}
      {canMutate && (
        <button
          onClick={() => openModal(null)}
          className="md:hidden fixed right-4 bottom-20 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
          aria-label="Add admin"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

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
    </DashboardShell>
  );
}
