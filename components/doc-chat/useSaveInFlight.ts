"use client";

import { useEffect, useRef } from "react";
import { pendingOutputSave } from "@/lib/docChat/store";

export type SaveSettled = { id: string } | { error: unknown };

/**
 * For a generated item's card: a save of the item still running from before
 * the card remounted (a tab switch mid-upload — lib/docChat/store) reports
 * here when it settles, so the card shows its outcome instead of offering a
 * second save. Start the card's busy state from `pendingOutputSave(id)`.
 */
export function useSaveInFlight(toolUseId: string, onSettled: (result: SaveSettled) => void): void {
  const callback = useRef(onSettled);
  callback.current = onSettled;
  useEffect(() => {
    const pending = pendingOutputSave(toolUseId);
    if (!pending) return;
    let live = true;
    pending.then(
      (id) => live && callback.current({ id }),
      (error: unknown) => live && callback.current({ error })
    );
    return () => {
      live = false;
    };
  }, [toolUseId]);
}
