"use client";

import { createContext, useContext } from "react";
import type { AdminPermissions } from "@/lib/permissions";

export interface AdminContextValue {
  adminId: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  isSuper: boolean;
  permissions: AdminPermissions;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({
  value,
  children,
}: {
  value: AdminContextValue;
  children: React.ReactNode;
}) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
