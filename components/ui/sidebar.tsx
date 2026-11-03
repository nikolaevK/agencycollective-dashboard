"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// shadcn "Luma" sidebar (radix-luma registry), hand-ported to Tailwind v3
// (data-open: → data-[state=open]:, data-active: → data-[active=true]:,
// w-(--x) → w-[var(--x)], size-8! → !size-8, outline-hidden → outline-none).
// Deliberate differences from upstream:
// - ONE element is both layouts: below md it is the off-canvas drawer
//   (`open`), from md the in-flow rail that collapses to icons (`collapsed`).
//   No useIsMobile → Sheet swap, so server and client render the same markup
//   (no hydration flash). Icon-mode styles are therefore md-scoped
//   (`md:group-data-[collapsible=icon]/sidebar:`) — the drawer is always
//   full width.
// - The caller owns the state: no provider cookie, no Cmd/Ctrl+B shortcut
//   (it would steal "bold" from the app's text editors).
// - Tooltips exist only on the md+ icon rail, and their Radix module is
//   imported the first time the rail is collapsed there — it stays out of
//   every page's first load, and phones never fetch it.
// - Badges shrink to a dot at the icon's corner in icon mode instead of
//   disappearing (the count would cover the 16px icon).
// - The open drawer (below md) is a modal dialog: Tab cycles inside it. The
//   caller moves focus in/out and makes the rest of the app inert.

const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_ICON = "3rem"

type TooltipKit = typeof import("@/components/ui/tooltip")

type SidebarContextValue = {
  state: "expanded" | "collapsed"
  /** The tooltip module — null until the rail first collapses. */
  tooltipKit: TooltipKit | null
}

const SidebarContext = React.createContext<SidebarContextValue>({
  state: "expanded",
  tooltipKit: null,
})

function useSidebar() {
  return React.useContext(SidebarContext)
}

let tooltipKitCache: TooltipKit | null = null

// Tailwind's md — where the drawer becomes the rail.
const DESKTOP_QUERY = "(min-width: 768px)"
function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}
const isDesktop = () => window.matchMedia(DESKTOP_QUERY).matches
// Server + hydration: false, so tooltips only ever start on the client.
const isDesktopOnServer = () => false

function useTooltipKit(enabled: boolean): TooltipKit | null {
  const [kit, setKit] = React.useState<TooltipKit | null>(null)

  React.useEffect(() => {
    if (!enabled || kit) return
    if (tooltipKitCache) {
      setKit(tooltipKitCache)
      return
    }
    let live = true
    import("@/components/ui/tooltip")
      .then((m) => {
        tooltipKitCache = m
        if (live) setKit(m)
      })
      // No tooltips then — the clipped label still names every button.
      .catch(() => {})
    return () => {
      live = false
    }
  }, [enabled, kit])

  return kit
}

type SidebarProps = React.ComponentPropsWithoutRef<"aside"> & {
  /** md and up: the icon-only rail. */
  collapsed?: boolean
  /** Below md: the drawer is on screen. */
  open?: boolean
}

// Keeps Tab / Shift+Tab inside the open drawer (wraps at either end).
function trapTab(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab" || e.defaultPrevented) return
  // Portaled content (the account menu) bubbles here through React, not the DOM.
  if (!e.currentTarget.contains(e.target as Node)) return
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
  ).filter((el) => el.getClientRects().length > 0)
  if (items.length === 0) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ collapsed = false, open = false, className, style, onKeyDown, children, ...props }, ref) => {
    const desktop = React.useSyncExternalStore(subscribeDesktop, isDesktop, isDesktopOnServer)
    // A collapsed cookie on a phone must not load (or wrap the drawer in)
    // tooltips — the drawer always shows its labels.
    const tooltips = collapsed && desktop
    const tooltipKit = useTooltipKit(tooltips)
    const state: SidebarContextValue["state"] = collapsed ? "collapsed" : "expanded"
    const value = React.useMemo<SidebarContextValue>(
      () => ({ state, tooltipKit: tooltips ? tooltipKit : null }),
      [state, tooltips, tooltipKit]
    )

    return (
      <SidebarContext.Provider value={value}>
        <aside
          ref={ref}
          data-slot="sidebar"
          data-state={state}
          data-collapsible={collapsed ? "icon" : ""}
          // Below md, open = a modal drawer over the app.
          role={open ? "dialog" : undefined}
          aria-modal={open ? true : undefined}
          aria-label={open ? "Menu" : undefined}
          onKeyDown={(e) => {
            onKeyDown?.(e)
            if (open) trapTab(e)
          }}
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar flex h-full w-[var(--sidebar-width)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground duration-200 ease-in-out",
            // Below md: off-canvas drawer, above the bottom nav (z-50) and the
            // backdrop. `invisible` while closed keeps its links out of the
            // tab order. Visibility is transitioned only when closing (it
            // flips after the slide-out); opening shows it at once, so focus
            // can move in right away.
            "fixed inset-y-0 left-0 z-[60] shadow-xl",
            open
              ? "visible translate-x-0 transition-[width,transform]"
              : "invisible -translate-x-full transition-[width,transform,visibility]",
            // md and up: the in-flow rail.
            "md:visible md:relative md:z-50 md:translate-x-0 md:shadow-none md:data-[collapsible=icon]:w-[var(--sidebar-width-icon)]",
            className
          )}
          {...props}
        >
          {children}
        </aside>
      </SidebarContext.Provider>
    )
  }
)
Sidebar.displayName = "Sidebar"

const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
)
SidebarHeader.displayName = "SidebarHeader"

const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
)
SidebarFooter.displayName = "SidebarFooter"

const SidebarSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="none"
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 h-px w-auto shrink-0 bg-sidebar-border", className)}
      {...props}
    />
  )
)
SidebarSeparator.displayName = "SidebarSeparator"

// Scrolls vertically in BOTH modes (upstream clips in icon mode, which cut
// off the bottom items on short screens); thin scrollbar, none on the rail.
const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin] md:group-data-[collapsible=icon]/sidebar:[scrollbar-width:none]",
        className
      )}
      {...props}
    />
  )
)
SidebarContent.displayName = "SidebarContent"

const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
)
SidebarGroup.displayName = "SidebarGroup"

// In icon mode the label fades and slides up over the previous group's last
// row (-mt-8); pointer-events-none keeps it from stealing that row's clicks.
const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "div"
  return (
    <Comp
      ref={ref}
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "flex h-8 shrink-0 items-center rounded-xl px-3 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0 md:group-data-[collapsible=icon]/sidebar:pointer-events-none md:group-data-[collapsible=icon]/sidebar:-mt-8 md:group-data-[collapsible=icon]/sidebar:opacity-0",
        className
      )}
      {...props}
    />
  )
})
SidebarGroupLabel.displayName = "SidebarGroupLabel"

const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
)
SidebarGroupContent.displayName = "SidebarGroupContent"

const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentPropsWithoutRef<"ul">>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-0.5", className)}
      {...props}
    />
  )
)
SidebarMenu.displayName = "SidebarMenu"

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<"li">>(
  ({ className, ...props }, ref) => (
    <li
      ref={ref}
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
)
SidebarMenuItem.displayName = "SidebarMenuItem"

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-xl px-3 py-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&_svg]:size-4 [&_svg]:shrink-0 md:group-data-[collapsible=icon]/sidebar:!size-8 md:group-data-[collapsible=icon]/sidebar:!p-2",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-active-bg))]",
      },
      // shadcn's canonical row heights (Luma ships h-9) — the admin nav has
      // 15 items in 6 groups and should fit a laptop screen.
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm md:group-data-[collapsible=icon]/sidebar:!p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type SidebarMenuButtonProps = React.ComponentPropsWithoutRef<"button"> & {
  asChild?: boolean
  isActive?: boolean
  /** Label shown to the right of the button in icon mode only. */
  tooltip?: string
} & VariantProps<typeof sidebarMenuButtonVariants>

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  (
    { asChild = false, isActive = false, variant = "default", size = "default", tooltip, className, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    const { state, tooltipKit } = useSidebar()

    const button = (
      <Comp
        ref={ref}
        data-slot="sidebar-menu-button"
        data-sidebar="menu-button"
        data-size={size}
        data-active={isActive}
        className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
        {...props}
      />
    )

    if (!tooltip || state !== "collapsed" || !tooltipKit) return button

    const { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } = tooltipKit
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" align="center">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
)
SidebarMenuButton.displayName = "SidebarMenuButton"

// A sibling of the button inside SidebarMenuItem. In icon mode it shrinks to
// a solid dot in the badge's text color (bg-current), ringed by the sidebar
// background, at the button's corner — a count there would hide the icon.
const SidebarMenuBadge = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<"span">>(
  ({ className, children, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 select-none rounded-full md:group-data-[collapsible=icon]/sidebar:right-0 md:group-data-[collapsible=icon]/sidebar:top-0 md:group-data-[collapsible=icon]/sidebar:translate-y-0 md:group-data-[collapsible=icon]/sidebar:bg-sidebar md:group-data-[collapsible=icon]/sidebar:p-0.5"
      {...props}
    >
      <span
        className={cn(
          "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums text-sidebar-foreground md:group-data-[collapsible=icon]/sidebar:size-2 md:group-data-[collapsible=icon]/sidebar:min-w-0 md:group-data-[collapsible=icon]/sidebar:border-0 md:group-data-[collapsible=icon]/sidebar:bg-current md:group-data-[collapsible=icon]/sidebar:p-0",
          className
        )}
      >
        <span className="md:group-data-[collapsible=icon]/sidebar:hidden">{children}</span>
      </span>
    </span>
  )
)
SidebarMenuBadge.displayName = "SidebarMenuBadge"

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  sidebarMenuButtonVariants,
  useSidebar,
}
