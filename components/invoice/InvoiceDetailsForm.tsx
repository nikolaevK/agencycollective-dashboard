"use client";

import { useRef } from "react";
import { Upload, X, Check } from "lucide-react";
import { CURRENCIES, THEME_COLORS } from "@/lib/invoice/validation";
import { cn } from "@/lib/utils";
import { INPUT_CLS } from "./styles";

const MAX_LOGO_BYTES = 500 * 1024; // 500 KB

interface Props {
  logo: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  terms: string;
  currency: string;
  themeColor: string;
  onChange: (field: string, value: string) => void;
}

export function InvoiceDetailsForm({
  logo,
  invoiceNumber,
  invoiceDate,
  dueDate,
  terms,
  currency,
  themeColor,
  onChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      alert("Logo must be under 500 KB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange("invoiceLogo", reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-5">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
        Invoice Details
      </h3>

      <div className="flex flex-col sm:flex-row gap-5">
        {/* Logo */}
        <div className="shrink-0">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Logo
          </label>
          {logo ? (
            <div className="relative group">
              <img
                src={logo}
                alt="Invoice logo"
                className="h-20 w-20 rounded-lg border border-border object-contain bg-background"
              />
              <button
                type="button"
                onClick={() => {
                  onChange("invoiceLogo", "");
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Upload className="h-5 w-5 mb-1" />
              <span className="text-[10px]">Upload</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
        </div>

        {/* Invoice fields */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Invoice Number
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => onChange("invoiceNumber", e.target.value)}
              placeholder="INV-001"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => onChange("currency", e.target.value)}
              className={cn(INPUT_CLS, "appearance-none cursor-pointer")}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Invoice Date
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => onChange("invoiceDate", e.target.value)}
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => onChange("dueDate", e.target.value)}
              className={INPUT_CLS}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Terms
            </label>
            <input
              type="text"
              value={terms}
              onChange={(e) => onChange("terms", e.target.value)}
              placeholder="e.g. Due on receipt, Net 30"
              className={INPUT_CLS}
            />
          </div>
        </div>
      </div>

      {/* Theme color selector */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">
          Theme Color
        </label>
        <div className="flex flex-wrap gap-2">
          {THEME_COLORS.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => onChange("themeColor", t.color)}
              title={t.label}
              className={cn(
                "relative h-8 w-8 rounded-full transition-all",
                themeColor !== t.color && "hover:scale-110"
              )}
              style={{
                backgroundColor: t.color,
                ...(themeColor === t.color
                  ? { boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${t.color}` }
                  : {}),
              }}
            >
              {themeColor === t.color && (
                <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
