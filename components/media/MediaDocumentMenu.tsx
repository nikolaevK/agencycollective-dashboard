"use client";

import { useRef } from "react";
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

/** A file's secondary actions (rename, move, tags, important, delete). */
export function MediaDocumentMenu({
  fileName,
  important,
  isManager,
  onStartRename,
  onOpenMove,
  onOpenTags,
  onToggleImportant,
  onDelete,
}: {
  fileName: string;
  important: boolean;
  isManager: boolean;
  onStartRename: () => void;
  onOpenMove: () => void;
  onOpenTags: () => void;
  onToggleImportant: (next: boolean) => void;
  onDelete: () => void;
}) {
  // Picks that open something (the inline rename input, a dialog) run once
  // the menu has fully closed. Rename keeps focus off the trigger — handing it
  // back would blur the input straight away, which commits it. Dialogs open
  // after the trigger has focus again, so closing them returns there.
  const afterClose = useRef<{ run: () => void; ownsFocus: boolean } | null>(null);
  const later = (run: () => void, ownsFocus = false) => () => {
    afterClose.current = { run, ownsFocus };
  };

  return (
    // modal={false}: picks open dialogs; a modal menu closing underneath them
    // can leave <body> pointer-events stuck.
    <DropdownMenu modal={false}>
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
        align="end"
        {...noDrag}
        onCloseAutoFocus={(e) => {
          const next = afterClose.current;
          if (!next) return;
          afterClose.current = null;
          if (next.ownsFocus) e.preventDefault();
          next.run();
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
