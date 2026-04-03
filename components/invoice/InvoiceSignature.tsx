"use client";

import { useState, useRef, useEffect } from "react";
import { Pen, Type, Upload, X, Trash2 } from "lucide-react";
import type { SignatureData } from "@/types/invoice";
import { SIGNATURE_FONTS, SIGNATURE_COLORS } from "@/lib/invoice/validation";
import { cn } from "@/lib/utils";

interface Props {
  signature: SignatureData | null;
  onChange: (sig: SignatureData | null) => void;
}

type Tab = "draw" | "type" | "upload";

export function InvoiceSignature({ signature, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("draw");
  const [typedText, setTypedText] = useState(signature?.type === "type" ? signature.data : "");
  const [selectedFont, setSelectedFont] = useState(
    signature?.fontFamily || SIGNATURE_FONTS[0].name
  );
  const [selectedColor, setSelectedColor] = useState(
    signature?.color || SIGNATURE_COLORS[0].color
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load Google Fonts for typed signatures
  useEffect(() => {
    if (tab === "type") {
      const families = SIGNATURE_FONTS.map((f) => f.name.replace(/ /g, "+")).join("&family=");
      const link = document.createElement("link");
      link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
      link.rel = "stylesheet";
      if (!document.querySelector(`link[href="${link.href}"]`)) {
        document.head.appendChild(link);
      }
    }
  }, [tab]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  useEffect(() => {
    if (tab === "draw" && open) {
      setTimeout(initCanvas, 50);
    }
  }, [tab, open, selectedColor]);

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if ("touches" in e) e.preventDefault();
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.beginPath();
    ctx.moveTo(x * scaleX, y * scaleY);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if ("touches" in e) e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.lineTo(x * scaleX, y * scaleY);
    ctx.stroke();
  };

  const stopDraw = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSaveDrawn = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange({
      type: "draw",
      data: canvas.toDataURL("image/png"),
      color: selectedColor,
    });
    setOpen(false);
  };

  const handleSaveTyped = () => {
    if (!typedText.trim()) return;
    onChange({
      type: "type",
      data: typedText,
      fontFamily: selectedFont,
      color: selectedColor,
    });
    setOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        type: "upload",
        data: reader.result as string,
      });
      setOpen(false);
    };
    reader.readAsDataURL(file);
  };

  const tabs: { id: Tab; label: string; icon: typeof Pen }[] = [
    { id: "draw", label: "Draw", icon: Pen },
    { id: "type", label: "Type", icon: Type },
    { id: "upload", label: "Upload", icon: Upload },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Signature
        </label>
        {signature && (
          <button
            onClick={() => onChange(null)}
            className="text-xs text-destructive hover:text-destructive/80 transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      {/* Preview of current signature */}
      {signature && !open && (
        <div
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-lg border border-border bg-white p-3 hover:border-primary/50 transition-colors"
        >
          {signature.type === "draw" || signature.type === "upload" ? (
            <img
              src={signature.data}
              alt="Signature"
              className="h-16 object-contain"
            />
          ) : (
            <p
              style={{
                fontFamily: `'${signature.fontFamily}', cursive`,
                color: signature.color || "#000",
                fontSize: "28px",
              }}
            >
              {signature.data}
            </p>
          )}
        </div>
      )}

      {!signature && !open && (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-4 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Pen className="h-4 w-4" />
          Add Signature
        </button>
      )}

      {/* Modal */}
      {open && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Color selector */}
          {(tab === "draw" || tab === "type") && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Color:</span>
              {SIGNATURE_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setSelectedColor(c.color)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-all",
                    selectedColor === c.color
                      ? "border-primary scale-110"
                      : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: c.color }}
                />
              ))}
            </div>
          )}

          {/* Draw tab */}
          {tab === "draw" && (
            <div className="space-y-2">
              <canvas
                ref={canvasRef}
                width={500}
                height={150}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
                className="w-full rounded-lg border border-border bg-white cursor-crosshair touch-none"
                style={{ height: "120px" }}
              />
              <div className="flex gap-2">
                <button
                  onClick={clearCanvas}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Type tab */}
          {tab === "type" && (
            <div className="space-y-3">
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Type your signature"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
              />
              <div className="flex flex-wrap gap-2">
                {SIGNATURE_FONTS.map((f) => (
                  <button
                    key={f.name}
                    onClick={() => setSelectedFont(f.name)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm transition-colors",
                      selectedFont === f.name
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    )}
                    style={{ fontFamily: `'${f.name}', cursive` }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {typedText && (
                <div className="rounded-lg border border-border bg-white p-3">
                  <p
                    style={{
                      fontFamily: `'${selectedFont}', cursive`,
                      color: selectedColor,
                      fontSize: "28px",
                    }}
                  >
                    {typedText}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Upload tab */}
          {tab === "upload" && (
            <div>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-6 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Upload className="h-5 w-5" />
                Upload signature image
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            {tab !== "upload" && (
              <button
                onClick={tab === "draw" ? handleSaveDrawn : handleSaveTyped}
                className="rounded-md px-4 py-1.5 text-xs font-medium text-white ac-gradient hover:opacity-90 transition-opacity"
              >
                Save Signature
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
