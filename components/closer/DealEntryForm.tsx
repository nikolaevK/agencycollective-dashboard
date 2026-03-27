"use client";

import { UnifiedDealForm } from "@/components/shared/UnifiedDealForm";

interface Props {
  onSuccess?: () => void;
}

export function DealEntryForm({ onSuccess }: Props) {
  return <UnifiedDealForm mode="create" context="closer" onSuccess={onSuccess} />;
}
