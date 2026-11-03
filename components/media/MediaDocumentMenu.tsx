"use client";

import { useEffect, useRef } from "react";
import { FolderInput, MoreHorizontal, Pencil, Star, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { IMPORTANT_STAR_CLS } from "./mediaDirectoryShared";

// The menu is portaled, but React still bubbles its pointer events through
// the draggable tile — stop them so a press inside the menu never arms a drag.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const noDrag = { onMouseDown: stop, onTouchStart: stop, onPointerDown: stop };

/**
 * A file's secondary actions (rename, move, tags, important, delete). Loaded
 * and mounted by the tile on its first open — until then the tile shows a
 * static ⋯ button with the same look — so it's controlled from there.
 */
export function MediaDocumentMenu({
  open,
  onOpenChange,
  focusFirstItem,
  fileName,
  important,
  isManager,
  onStartRename,
  onOpenMove,
  onOpenTags,
  onToggleImportant,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened from the keyboard before this menu existed. */
  focusFirstItem?: boolean;
  fileName: string;
  important: boolean;
  isManager: boolean;
  onStartRename: () => void;
  onOpenMove: () => void;
  onOpenTags: () => void;
  onToggleImportant: (next: boolean) => void;
  onDelete: () => void;
}) {
  // Picks that open something (the inline rename input, a dialog, the delete
  // confirm) run once the menu has fully closed. Rename keeps focus off the
  // trigger — handing it back would blur the input straight away, which
  // commits it. The rest wait for Radix to hand focus back to the trigger
  // (it does so right after this handler), so the dialog / confirm they open
  // records the trigger as its return point instead of <body>.
  const afterClose = useRef<{ run: () => void; ownsFocus: boolean } | null>(null);
  const later = (run: () => void, ownsFocus = false) => () => {
    afterClose.current = { run, ownsFocus };
  };

  // Radix moves to the first item when a KEY opened the menu, but this one
  // mounted after that key press (the tile's static button took it) — do the
  // same here, on the first open only.
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusFirstItem) return;
    const id = requestAnimationFrame(() =>
      contentRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    );
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // modal={false}: picks open dialogs; a modal menu closing underneath them
    // can leave <body> pointer-events stuck.
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          {...noDrag}
          className="text-muted-foreground"
          aria-label={`More actions for ${fileName}`}
          title="More actions"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={contentRef}
        align="end"
        {...noDrag}
        onCloseAutoFocus={(e) => {
          const next = afterClose.current;
          if (!next) return;
          afterClose.current = null;
          if (next.ownsFocus) {
            e.preventDefault();
            next.run();
          } else {
            setTimeout(next.run, 0);
          }
        }}
      >
        <DropdownMenuItem onSelect={later(onStartRename, true)}>
          <Pencil />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={later(onOpenMove)}>
          <FolderInput />
          Move to folder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={later(onOpenTags)}>
          <Tag />
          Edit tags
        </DropdownMenuItem>
        {isManager && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onToggleImportant(!important)}>
              <Star className={cn(important && IMPORTANT_STAR_CLS)} />
              {important ? "Unmark important" : "Mark important"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={later(onDelete)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
