"use client"

import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const YMD = "yyyy-MM-dd"

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
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
          onSelect={pick}
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
