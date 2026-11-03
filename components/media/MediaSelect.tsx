"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Radix Select can't hold "" as an item value — "" options ride on this
// sentinel and are mapped back before the caller sees them.
export const EMPTY_OPTION = "__none__";

export interface MediaSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  "aria-label": string;
  title?: string;
  className?: string;
}

// The kit SelectTrigger's look (components/ui/select.tsx) at the toolbar's h-8.
const TRIGGER_CLS =
  "flex h-8 w-auto min-w-0 items-center justify-between gap-1.5 whitespace-nowrap rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 [&>span]:line-clamp-1";

type MenuModule = typeof import("./MediaSelectMenu");
let menuModule: MenuModule | null = null;
let menuLoad: Promise<MenuModule> | null = null;

function loadMenu(): Promise<MenuModule> {
  menuLoad ??= import("./MediaSelectMenu").then(
    (m) => (menuModule = m),
    (err) => {
      menuLoad = null; // let the next attempt retry
      throw err;
    }
  );
  return menuLoad;
}
const warm = () => void loadMenu().catch(() => {});

/**
 * The directory's toolbar / upload-bar select. Paints as a plain button with
 * the kit trigger's look and the current label; the Radix Select chunk is
 * fetched on intent (hover / focus) and swapped in, already open, the first
 * time the select is opened.
 */
export function MediaSelect(props: MediaSelectProps) {
  const [armed, setArmed] = useState(false);

  if (armed && menuModule) {
    const { MediaSelectMenu } = menuModule;
    return <MediaSelectMenu {...props} defaultOpen />;
  }

  const { value, options, "aria-label": ariaLabel, title, className } = props;
  const open = () => {
    // The button keeps focus until the real select mounts and takes it.
    loadMenu().then(() => setArmed(true), () => {});
  };
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={false}
      aria-haspopup="listbox"
      title={title}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          open();
        }
      }}
      onPointerEnter={warm}
      onFocus={warm}
      className={cn(TRIGGER_CLS, className)}
    >
      <span className="pointer-events-none">{options.find((o) => o.value === value)?.label ?? value}</span>
      <ChevronDown aria-hidden className="pointer-events-none size-4 text-muted-foreground" />
    </button>
  );
}
