"use client"

import type { RefObject } from "react"
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
  returnFocus,
}: {
  options: ConfirmOptions | null
  onSettle: (ok: boolean) => void
  /** The element that had focus when confirm() was called. */
  returnFocus?: RefObject<HTMLElement | null>
}) {
  return (
    <AlertDialog open={options !== null} onOpenChange={(open) => !open && onSettle(false)}>
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // Back to the button that asked (a deleted row's button is gone —
          // then Radix's default applies).
          const el = returnFocus?.current
          if (el?.isConnected) {
            e.preventDefault()
            el.focus({ preventScroll: true })
          }
        }}
      >
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
