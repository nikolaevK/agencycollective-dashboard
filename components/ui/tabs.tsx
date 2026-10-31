"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

type PillBox = { left: number; top: number; width: number; height: number }

// Last pill box per `sliding` key, kept across remounts — route tabs mount a
// fresh list on every page, so this is where the pill slides FROM. Only a
// fresh hand-over counts: coming back to the section later starts in place.
const lastPillBoxes = new Map<string, { box: PillBox; at: number }>()
const HANDOVER_MS = 1000

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    /** The active pill slides between tabs (default). A string key also
     *  carries its position across remounts, for one-list-per-page route tabs. */
    sliding?: boolean | string
  }
>(({ className, sliding = true, children, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const pillRef = React.useRef<HTMLSpanElement>(null)
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  useIsoLayoutEffect(() => {
    const list = listRef.current
    const pill = pillRef.current
    if (!sliding || !list || !pill) return
    const key = typeof sliding === "string" ? sliding : null
    let placed: PillBox | null = null
    const apply = (b: PillBox) => {
      pill.style.transform = `translate(${b.left}px, ${b.top}px)`
      pill.style.width = `${b.width}px`
      pill.style.height = `${b.height}px`
    }
    const place = () => {
      const tab = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
      // No active tab, or a hidden list (display:none measures 0×0): no pill —
      // the active trigger draws its own background again — until the
      // observers see it measurable.
      if (!tab || tab.offsetWidth === 0) {
        pill.style.opacity = "0"
        delete list.dataset.sliding
        placed = null
        return
      }
      const box = { left: tab.offsetLeft, top: tab.offsetTop, width: tab.offsetWidth, height: tab.offsetHeight }
      if (!placed) {
        // Hand the background to the pill, paint its start box (a fresh
        // hand-over from the previous mount, else the target) with no
        // transition, then let the CSS transition run. Until now the active
        // trigger drew its own background (no flash before hydration).
        list.dataset.sliding = "ready"
        const from = key ? lastPillBoxes.get(key) : undefined
        pill.style.transition = "none"
        apply(from && performance.now() - from.at < HANDOVER_MS ? from.box : box)
        pill.getBoundingClientRect()
        pill.style.transition = ""
        pill.style.opacity = "1"
      } else if (
        placed.left === box.left && placed.top === box.top &&
        placed.width === box.width && placed.height === box.height
      ) {
        return
      }
      apply(box)
      placed = box
      if (key) lastPillBoxes.set(key, { box, at: performance.now() })
    }
    place()
    const mutations = new MutationObserver(place)
    mutations.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-state"] })
    const resizes = new ResizeObserver(place)
    resizes.observe(list)
    return () => {
      mutations.disconnect()
      resizes.disconnect()
      // Route tabs unmount mid-slide (the next page mounts its own list): hand
      // over where the pill IS, not where it was heading, so the slide goes on.
      if (key && placed) {
        const p = pill.getBoundingClientRect()
        const l = list.getBoundingClientRect()
        if (p.width > 0) {
          lastPillBoxes.set(key, {
            box: { left: p.left - l.left, top: p.top - l.top, width: p.width, height: p.height },
            at: performance.now(),
          })
        }
      }
    }
  }, [sliding])

  return (
    <TabsPrimitive.List
      ref={setRefs}
      className={cn(
        "group/tabs relative inline-flex h-9 w-fit items-center justify-center rounded-full bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    >
      {sliding && (
        <span
          ref={pillRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 rounded-full bg-background opacity-0 transition-[transform,width,height] duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none dark:bg-input/30"
        />
      )}
      {children}
    </TabsPrimitive.List>
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

// Radix focuses a trigger from script on mouse-down (a Safari fix), which
// Chrome counts as :focus-visible — so a click drew the keyboard focus ring.
// Pointer presses mark the trigger; any key press or blur clears the mark,
// so keyboard users still get the ring.
const clearPointerMark = (e: React.SyntheticEvent<HTMLElement>) => {
  delete e.currentTarget.dataset.pointer
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, onPointerDown, onKeyDown, onBlur, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    onPointerDown={(e) => {
      e.currentTarget.dataset.pointer = ""
      onPointerDown?.(e)
    }}
    onKeyDown={(e) => {
      clearPointerMark(e)
      onKeyDown?.(e)
    }}
    onBlur={(e) => {
      clearPointerMark(e)
      onBlur?.(e)
    }}
    className={cn(
      "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-2 rounded-full border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[pointer]:focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground group-data-[sliding=ready]/tabs:data-[state=active]:bg-transparent dark:group-data-[sliding=ready]/tabs:data-[state=active]:bg-transparent group-data-[sliding=ready]/tabs:transition-[color,box-shadow]",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "flex-1 text-sm outline-none",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
