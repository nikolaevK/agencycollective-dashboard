"use client";

import { Plus, X } from "lucide-react";
import type { InvoiceSender } from "@/types/invoice";
import { cn } from "@/lib/utils";
import { INPUT_CLS } from "./styles";

interface Props {
  sender: InvoiceSender;
  onChange: (sender: InvoiceSender) => void;
}

export function InvoiceSenderForm({ sender, onChange }: Props) {
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
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
        Bill From
      </h3>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            type="text"
            value={sender.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Your business name"
            className={INPUT_CLS}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Email
          </label>
          <input
            type="email"
            value={sender.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="email@example.com"
            className={INPUT_CLS}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Phone
          </label>
          <input
            type="tel"
            value={sender.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+1 (555) 000-0000"
            className={INPUT_CLS}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Address
          </label>
          <input
            type="text"
            value={sender.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="Street address"
            className={INPUT_CLS}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              City
            </label>
            <input
              type="text"
              value={sender.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="City"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Zip Code
            </label>
            <input
              type="text"
              value={sender.zipCode}
              onChange={(e) => update("zipCode", e.target.value)}
              placeholder="Zip"
              className={INPUT_CLS}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Country
          </label>
          <input
            type="text"
            value={sender.country}
            onChange={(e) => update("country", e.target.value)}
            placeholder="Country"
            className={INPUT_CLS}
          />
        </div>
      </div>

      {/* Custom inputs */}
      {sender.customInputs.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          {sender.customInputs.map((input, index) => (
            <div key={input.id} className="flex items-start gap-2">
              <input
                type="text"
                value={input.key}
                onChange={(e) =>
                  updateCustomInput(index, "key", e.target.value)
                }
                placeholder="Label (e.g. VAT Number)"
                className={cn(INPUT_CLS, "flex-1")}
              />
              <input
                type="text"
                value={input.value}
                onChange={(e) =>
                  updateCustomInput(index, "value", e.target.value)
                }
                placeholder="Value"
                className={cn(INPUT_CLS, "flex-1")}
              />
              <button
                type="button"
                onClick={() => removeCustomInput(index)}
                className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addCustomInput}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Custom Field
      </button>
    </div>
  );
}
