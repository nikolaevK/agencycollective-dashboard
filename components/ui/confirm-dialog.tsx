"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import type { ConfirmOptions } from "@/components/ui/use-confirm"

/** useConfirm's dialog — its own module so the hook can load it lazily. */
export function ConfirmDialog({
  options,
  onSettle,
}: {
  options: ConfirmOptions | null
  onSettle: (ok: boolean) => void
}) {
  return (
    <AlertDialog open={options !== null} onOpenChange={(open) => !open && onSettle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {/* Confirm titles quote user text (file names, titles) — an unbroken
              string must wrap, not widen the dialog's grid track. */}
          <AlertDialogTitle className="[overflow-wrap:anywhere]">{options?.title}</AlertDialogTitle>
          {options?.description != null && (
            <AlertDialogDescription className="[overflow-wrap:anywhere]">{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onSettle(false)}>
            {options?.cancelText ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onSettle(true)}
            className={
              options?.destructive
                ? buttonVariants({ className: "bg-destructive text-destructive-foreground hover:bg-destructive/90" })
                : undefined
            }
          >
            {options?.confirmText ?? "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
