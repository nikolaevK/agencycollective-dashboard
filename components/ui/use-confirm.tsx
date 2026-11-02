"use client"

import * as React from "react"

import dynamic from "next/dynamic"

// Lazy: the AlertDialog (+ Radix focus/dismiss layers) stays out of every
// page's first load. It's always rendered, so the chunk loads right after
// hydration — not on the first confirm.
const ConfirmDialog = dynamic(() => import("./confirm-dialog").then((m) => m.ConfirmDialog), {
  ssr: false,
})

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

  const dialog = <ConfirmDialog options={options} onSettle={settle} />

  return { confirm, dialog }
}
