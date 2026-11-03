import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { TOUCH_TARGET } from "@/components/ui/touch"

/** Status color families. "neutral" is the plain outline look. */
export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info"

// Subtle status coloring: a faintly tinted border + fill and toned text,
// paired with a BadgeDot of the same family. Kept as a separate variant so
// it layers over `outline` (tone classes come later, so they win in cn()).
// Exported for status controls that are Buttons, not badges.
export const badgeTone: Record<BadgeTone, string> = {
  neutral: "",
  success:
    "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
  warning:
    "border-amber-500/30 bg-amber-500/[0.08] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
  danger:
    "border-red-500/25 bg-red-500/[0.07] text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300",
  info: "border-sky-500/25 bg-sky-500/[0.08] text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300",
}

/** Hover for toned badges that are clickable (buttons). Static badges don't
 *  get it, so they never look interactive. */
export const badgeToneHover: Record<BadgeTone, string> = {
  neutral: "hover:bg-muted",
  success:
    "hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:bg-emerald-400/15 dark:hover:text-emerald-300",
  warning:
    "hover:bg-amber-500/15 hover:text-amber-700 dark:hover:bg-amber-400/15 dark:hover:text-amber-300",
  danger:
    "hover:bg-red-500/[0.12] hover:text-red-700 dark:hover:bg-red-400/15 dark:hover:text-red-300",
  info: "hover:bg-sky-500/15 hover:text-sky-700 dark:hover:bg-sky-400/15 dark:hover:text-sky-300",
}

const TONE_DOT: Record<BadgeTone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
}

// shadcn "Luma" style, Tailwind v3 syntax. success/warning are kept for
// existing callers.
const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-3xl border border-transparent px-2 py-0.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:!size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive dark:bg-destructive/20 [a&]:hover:bg-destructive/20",
        outline: "border-border text-foreground [a&]:hover:bg-muted",
        ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      },
      tone: badgeTone,
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/** For a badge rendered as a <button> (status chips that open a drawer): on
 *  touch screens an invisible ::after makes the 20px chip a 32px target. */
const badgeButtonClass = cn(
  TOUCH_TARGET,
  "overflow-visible [@media(pointer:coarse)]:after:-inset-x-1 [@media(pointer:coarse)]:after:-inset-y-1.5"
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, tone, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, tone }), className)} {...props} />
  )
}

/** The small status dot inside a badge, colored by tone. */
function BadgeDot({ tone = "neutral", className }: { tone?: BadgeTone; className?: string }) {
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone], className)} />
}

/** Outline badge + dot, tinted by tone — the standard status chip. */
function StatusBadge({
  tone = "neutral",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: BadgeTone }) {
  return (
    <Badge variant="outline" tone={tone} className={cn("gap-1.5 font-medium", className)} {...props}>
      <BadgeDot tone={tone} />
      {children}
    </Badge>
  )
}

export { Badge, BadgeDot, StatusBadge, badgeButtonClass, badgeVariants }
