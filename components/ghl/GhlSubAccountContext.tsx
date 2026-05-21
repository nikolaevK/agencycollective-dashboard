"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  DEFAULT_UI_SUB_ACCOUNT_ID,
  type GhlSubAccountId,
} from "@/lib/ghl/subAccounts";

// Scopes a subtree to one GHL sub-account so child components (contact
// detail, conversations tab, etc.) don't have to thread the id through
// every prop. The contacts page sets this from its active tab; everything
// underneath reads it via `useActiveGhlSubAccount()`.

const GhlSubAccountContext = createContext<GhlSubAccountId>(DEFAULT_UI_SUB_ACCOUNT_ID);

export function GhlSubAccountProvider({
  value,
  children,
}: {
  value: GhlSubAccountId;
  children: ReactNode;
}) {
  return (
    <GhlSubAccountContext.Provider value={value}>{children}</GhlSubAccountContext.Provider>
  );
}

export function useActiveGhlSubAccount(): GhlSubAccountId {
  return useContext(GhlSubAccountContext);
}
