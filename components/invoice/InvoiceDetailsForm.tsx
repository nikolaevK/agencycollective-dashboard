"use client";

import { useId, useRef, useState } from "react";
import { CURRENCIES } from "@/lib/invoice/validation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InvoiceField, LogoField, NativeSelect, ThemeSwatches } from "./InvoiceField";
import { isPdfImageType, PDF_IMAGE_ERROR } from "@/lib/invoice/pdfImage";

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
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState("");

  const handleLogoUpload = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo must be under 500 KB");
      return;
    }
    if (!isPdfImageType(file.type)) {
      setLogoError(PDF_IMAGE_ERROR);
      return;
    }
    setLogoError("");
    const reader = new FileReader();
    reader.onload = () => {
      onChange("invoiceLogo", reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          {/* Logo */}
          <div className="grid shrink-0 content-start gap-2">
            <Label htmlFor={`${id}-logo`}>Logo</Label>
            <LogoField
              size="lg"
              id={`${id}-logo`}
              logo={logo}
              inputRef={fileRef}
              onFile={handleLogoUpload}
              onRemove={() => {
                onChange("invoiceLogo", "");
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            {logoError && (
              <p role="alert" className="max-w-40 text-xs text-destructive">
                {logoError}
              </p>
            )}
          </div>

          {/* Invoice fields */}
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <InvoiceField label="Invoice Number" htmlFor={`${id}-number`}>
              <Input
                id={`${id}-number`}
                type="text"
                value={invoiceNumber}
                onChange={(e) => onChange("invoiceNumber", e.target.value)}
                placeholder="INV-001"
              />
            </InvoiceField>
            <InvoiceField label="Currency" htmlFor={`${id}-currency`}>
              <NativeSelect
                id={`${id}-currency`}
                value={currency}
                onChange={(e) => onChange("currency", e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name} ({c.symbol})
                  </option>
                ))}
              </NativeSelect>
            </InvoiceField>
            <InvoiceField label="Invoice Date" htmlFor={`${id}-date`}>
              <DatePicker
                id={`${id}-date`}
                value={invoiceDate}
                onValueChange={(v) => onChange("invoiceDate", v)}
              />
            </InvoiceField>
            <InvoiceField label="Due Date" htmlFor={`${id}-due`}>
              <DatePicker
                id={`${id}-due`}
                value={dueDate}
                onValueChange={(v) => onChange("dueDate", v)}
              />
            </InvoiceField>
            <InvoiceField label="Terms" htmlFor={`${id}-terms`} className="sm:col-span-2">
              <Input
                id={`${id}-terms`}
                type="text"
                value={terms}
                onChange={(e) => onChange("terms", e.target.value)}
                placeholder="e.g. Due on receipt, Net 30"
              />
            </InvoiceField>
          </div>
        </div>

        {/* Theme color selector */}
        <div className="grid gap-3">
          <span className="text-sm font-medium leading-none">Theme Color</span>
          <ThemeSwatches value={themeColor} onChange={(c) => onChange("themeColor", c)} />
        </div>
      </CardContent>
    </Card>
  );
}
