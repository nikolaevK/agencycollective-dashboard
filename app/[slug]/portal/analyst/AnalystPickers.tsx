"use client";

import type { ComponentProps } from "react";
import { ChevronDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The analyst's account + date pickers — their own module so the Radix menu
 * code loads lazily (AnalystInterface imports this with next/dynamic).
 */
export function AnalystPickers({
  accounts,
  accountId,
  accountDisplay,
  onAccountChange,
  onAccountMenuCloseAutoFocus,
  dateLabel,
  datePreset,
  datePresets,
  onDatePresetChange,
}: {
  accounts: Array<{ accountId: string; label: string | null }>;
  accountId: string;
  accountDisplay: string;
  onAccountChange: (nextId: string) => void;
  onAccountMenuCloseAutoFocus: ComponentProps<typeof DropdownMenuContent>["onCloseAutoFocus"];
  dateLabel: string;
  datePreset: string;
  datePresets: ReadonlyArray<{ id: string; label: string }>;
  onDatePresetChange: (preset: string) => void;
}) {
  return (
    <>
      {/* Account picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={accounts.length === 0} className="min-w-0 max-w-full">
            <Wallet className="text-muted-foreground" />
            <span className="min-w-0 max-w-[200px] truncate">{accountDisplay}</span>
            <ChevronDown className="text-muted-foreground transition-transform group-data-[state=open]/button:rotate-180" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 w-72 max-w-[calc(100vw-2rem)]"
          onCloseAutoFocus={onAccountMenuCloseAutoFocus}
        >
          <DropdownMenuLabel>Ad Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={accountId} onValueChange={onAccountChange}>
            {accounts.map((a) => (
              <DropdownMenuRadioItem key={a.accountId} value={a.accountId}>
                <div className="min-w-0">
                  <p className="truncate">{a.label ?? a.accountId}</p>
                  <p className="font-mono text-xs font-normal text-muted-foreground">{a.accountId}</p>
                </div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Date picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <span>{dateLabel}</span>
            <ChevronDown className="text-muted-foreground transition-transform group-data-[state=open]/button:rotate-180" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuRadioGroup value={datePreset} onValueChange={onDatePresetChange}>
            {datePresets.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id}>
                {p.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
