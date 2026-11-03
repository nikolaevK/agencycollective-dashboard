"use client";

import { useId, type ComponentProps, type ReactNode, type RefObject } from "react";
import { Check, ChevronDown, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { THEME_COLORS } from "@/lib/invoice/validation";
import { PDF_IMAGE_ACCEPT } from "@/lib/invoice/pdfImage";
import { cn } from "@/lib/utils";

/** Label above its control — the form-field look the invoice drawers use. */
export function InvoiceField({
  label,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** A labeled text input (or 2-row textarea) for the settings/profile forms.
 *  `wide` spans both columns of their 2-column field grids. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  wide,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <InvoiceField label={label} htmlFor={id} className={cn(wide && "col-span-2")}>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="resize-y"
        />
      ) : (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </InvoiceField>
  );
}

/** Native <select> dressed as the kit SelectTrigger. Kept native on purpose:
 *  same value/onChange contract and the browser's own keyboard behavior
 *  (type-to-select over long lists like the currencies), and no Radix
 *  Select runtime in the Invoice page chunk. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative min-w-0">
      <select
        {...props}
        className={cn(
          "flex h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-3xl border border-transparent bg-input/50 pl-3 pr-9 text-sm text-foreground outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-popover [&>option]:text-popover-foreground",
          className
        )}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/** Status line under a form (saved / failed) — the drawers' notice look. */
export const INVOICE_NOTICE = "rounded-2xl border px-3 py-2 text-xs font-medium";

/** Segmented control track + items (ToggleGroup), matching the drawers. */
export const SEGMENT_TRACK = "rounded-3xl bg-muted p-1";
export const SEGMENT_ITEM =
  "h-9 sm:h-7 rounded-full px-3 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm";

/**
 * The invoice theme colors (data, not chrome — they print on the PDF). The
 * selected one gets a card-colored gap + a ring in its own color.
 */
export function ThemeSwatches({
  value,
  onChange,
  size = "md",
}: {
  value: string;
  onChange: (color: string) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {THEME_COLORS.map((t) => {
        const selected = value === t.color;
        return (
          <button
            key={t.name}
            type="button"
            onClick={() => onChange(t.color)}
            title={t.label}
            aria-label={t.label}
            aria-pressed={selected}
            className={cn(
              "relative rounded-full outline-none transition-transform focus-visible:ring-[3px] focus-visible:ring-ring/50",
              size === "md" ? "size-8" : "size-7",
              !selected && "hover:scale-110"
            )}
            style={{
              backgroundColor: t.color,
              ...(selected ? { boxShadow: `0 0 0 2px hsl(var(--card)), 0 0 0 4px ${t.color}` } : {}),
            }}
          >
            {selected && (
              <Check className={cn("absolute inset-0 m-auto text-white", size === "md" ? "size-4" : "size-3.5")} />
            )}
          </button>
        );
      })}
    </div>
  );
}

const LOGO_SIZE = { sm: "size-14", md: "size-16", lg: "size-20" } as const;

/**
 * Logo picker: the uploaded image (white, like the printed page — a dark logo
 * stays visible in dark mode) with a remove button, or a dashed upload tile.
 * PNG/JPEG only (PDF_IMAGE_ACCEPT); the caller validates the picked file.
 */
export function LogoField({
  logo,
  inputRef,
  onFile,
  onRemove,
  hint,
  size = "md",
  id,
}: {
  logo: string;
  inputRef: RefObject<HTMLInputElement>;
  onFile: (file: File) => void;
  onRemove: () => void;
  hint?: ReactNode;
  size?: keyof typeof LOGO_SIZE;
  /** Put on the upload tile, for a <Label htmlFor>. */
  id?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {logo ? (
        <div className="group relative shrink-0">
          <img src={logo} alt="Logo" className={cn(LOGO_SIZE[size], "rounded-2xl border bg-white object-contain")} />
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove logo"
            className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-foreground text-background opacity-100 outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          id={id}
          onClick={() => inputRef.current?.click()}
          className={cn(
            LOGO_SIZE[size],
            "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-dashed border-foreground/15 text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
          )}
        >
          <Upload className={size === "lg" ? "size-5" : "size-4"} />
          <span className="text-[10px]">Upload</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={PDF_IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      {hint && <div className="min-w-0 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
