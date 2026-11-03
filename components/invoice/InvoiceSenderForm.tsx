"use client";

import { useId } from "react";
import { Plus, X } from "lucide-react";
import type { InvoiceSender } from "@/types/invoice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { InvoiceField } from "./InvoiceField";

interface Props {
  sender: InvoiceSender;
  onChange: (sender: InvoiceSender) => void;
}

type TextField = Exclude<keyof InvoiceSender, "customInputs">;

// Two columns: City + Zip share a row, everything else is full width.
const FIELDS: { key: TextField; label: string; type: string; placeholder: string; half?: boolean }[] = [
  { key: "name", label: "Name", type: "text", placeholder: "Your business name" },
  { key: "email", label: "Email", type: "email", placeholder: "email@example.com" },
  { key: "phone", label: "Phone", type: "tel", placeholder: "+1 (555) 000-0000" },
  { key: "address", label: "Address", type: "text", placeholder: "Street address" },
  { key: "city", label: "City", type: "text", placeholder: "City", half: true },
  { key: "zipCode", label: "Zip Code", type: "text", placeholder: "Zip", half: true },
  { key: "country", label: "Country", type: "text", placeholder: "Country" },
];

export function InvoiceSenderForm({ sender, onChange }: Props) {
  const id = useId();

  const update = (field: keyof InvoiceSender, value: string) => {
    onChange({ ...sender, [field]: value });
  };

  const addCustomInput = () => {
    onChange({
      ...sender,
      customInputs: [...sender.customInputs, { id: crypto.randomUUID(), key: "", value: "" }],
    });
  };

  const updateCustomInput = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const updated = sender.customInputs.map((input, i) =>
      i === index ? { ...input, [field]: value } : input
    );
    onChange({ ...sender, customInputs: updated });
  };

  const removeCustomInput = (index: number) => {
    onChange({
      ...sender,
      customInputs: sender.customInputs.filter((_, i) => i !== index),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bill From</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <InvoiceField
              key={f.key}
              label={f.label}
              htmlFor={`${id}-${f.key}`}
              className={cn(!f.half && "col-span-2")}
            >
              <Input
                id={`${id}-${f.key}`}
                type={f.type}
                value={sender[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
            </InvoiceField>
          ))}
        </div>

        {/* Custom inputs */}
        {sender.customInputs.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            {sender.customInputs.map((input, index) => (
              <div key={input.id} className="flex items-center gap-2">
                <Input
                  type="text"
                  aria-label="Custom field label"
                  value={input.key}
                  onChange={(e) => updateCustomInput(index, "key", e.target.value)}
                  placeholder="Label (e.g. VAT Number)"
                  className="flex-1"
                />
                <Input
                  type="text"
                  aria-label="Custom field value"
                  value={input.value}
                  onChange={(e) => updateCustomInput(index, "value", e.target.value)}
                  placeholder="Value"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeCustomInput(index)}
                  aria-label="Remove custom field"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button type="button" variant="ghost" size="sm" onClick={addCustomInput} className="-ml-2 px-2">
          <Plus />
          Add Custom Field
        </Button>
      </CardContent>
    </Card>
  );
}
