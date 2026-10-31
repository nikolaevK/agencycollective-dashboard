"use client"

import * as React from "react"

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

export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  /** Red confirm button for irreversible actions (delete, discard). */
  destructive?: boolean
}

/**
 * Promise-based replacement for window.confirm(), rendered as a shadcn
 * AlertDialog. Render `dialog` once in the component, then:
 *
 *   if (!(await confirm({ title: "Delete this deal?" }))) return;
 *
 * Resolves true on confirm, false on cancel / Escape / outside click.
 */
export function useConfirm() {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null)
  const resolver = React.useRef<((ok: boolean) => void) | null>(null)

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    // A still-pending earlier prompt counts as cancelled.
    resolver.current?.(false)
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = React.useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOptions(null)
  }, [])

  const dialog = (
    <AlertDialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {options?.description != null && (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {options?.cancelText ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
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

  return { confirm, dialog }
}
