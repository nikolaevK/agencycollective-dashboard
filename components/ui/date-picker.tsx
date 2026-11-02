"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { format, isValid, parse } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const YMD = "yyyy-MM-dd"

// Lazy: react-day-picker + its locale data (~100 kB raw) only load when a
// picker opens — forms with many date fields no longer pay for it up front.
// Hovering/focusing a trigger starts the download, so the popover is ready.
const loadCalendar = () => import("@/components/ui/calendar").then((m) => m.Calendar)
const Calendar = dynamic(loadCalendar, {
  ssr: false,
  loading: () => <div aria-hidden className="h-[296px] w-[252px]" />,
})

/** "yyyy-mm-dd" → local Date (never UTC — `new Date("2026-11-03")` would be
 *  the previous day west of Greenwich). Empty/invalid → undefined. */
function parseYmd(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = parse(value, YMD, new Date())
  return isValid(d) ? d : undefined
}

export interface DatePickerProps {
  /** "yyyy-mm-dd", or "" for no date — the same string an <input type="date"> holds. */
  value: string
  /** Receives "yyyy-mm-dd", or "" when cleared — what `e.target.value` gave. */
  onValueChange: (value: string) => void
  /** Bounds as "yyyy-mm-dd", like the native min/max attributes. */
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  "aria-label"?: string
  /** Show a Clear action (a native date input can be emptied). Default true. */
  clearable?: boolean
  /** Month + year dropdowns in the caption, for dates that can be years back
   *  (e.g. a join date) — instead of paging one month at a time. */
  yearNavigation?: boolean
}

/**
 * shadcn date picker (Popover + Calendar) as a drop-in for
 * <input type="date">: same string value in and out, so swapping
 * `onChange={(e) => set(e.target.value)}` for `onValueChange={set}`
 * changes nothing downstream.
 */
export function DatePicker({
  value,
  onValueChange,
  min,
  max,
  placeholder = "Pick a date",
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
  clearable = true,
  yearNavigation = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = parseYmd(value)
  const minDate = parseYmd(min)
  const maxDate = parseYmd(max)

  const outOfRange = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ]

  function pick(date: Date | undefined) {
    onValueChange(date ? format(date, YMD) : "")
    setOpen(false)
  }

  // Modal: an outside click only closes the calendar — inside a hand-built
  // modal it must not also land on that modal's backdrop and close it.
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          onPointerEnter={() => void loadCalendar()}
          onFocus={() => void loadCalendar()}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-3xl border border-transparent bg-input/50 px-3 text-left text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{selected ? format(selected, "MMM d, yyyy") : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto gap-0 p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maxDate ?? minDate}
          // Clicking the selected day again deselects in react-day-picker;
          // a native date input never emptied on a re-pick, so keep the date
          // and just close. Clearing is the explicit Clear button.
          onSelect={(date) => (date ? pick(date) : setOpen(false))}
          {...(yearNavigation
            ? {
                captionLayout: "dropdown" as const,
                startMonth: minDate ?? new Date(2015, 0),
                endMonth: maxDate ?? new Date(new Date().getFullYear() + 5, 11),
              }
            : {})}
          disabled={outOfRange.length ? outOfRange : undefined}
          autoFocus
        />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          {clearable ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => pick(undefined)}>
              Clear
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => pick(new Date())}>
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
