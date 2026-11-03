"use client";

import { useState, useRef, useEffect } from "react";
import { Pen, Type, Upload, Trash2 } from "lucide-react";
import type { SignatureData } from "@/types/invoice";
import { SIGNATURE_FONTS, SIGNATURE_COLORS } from "@/lib/invoice/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { isPdfImageType, PDF_IMAGE_ACCEPT, PDF_IMAGE_ERROR } from "@/lib/invoice/pdfImage";
import { SEGMENT_ITEM, SEGMENT_TRACK } from "./InvoiceField";

interface Props {
  signature: SignatureData | null;
  onChange: (sig: SignatureData | null) => void;
}

type Tab = "draw" | "type" | "upload";

// The signature surfaces stay white in both themes: the signature prints on
// the white invoice page, and its ink colors are picked for paper.
const PAPER = "rounded-2xl border bg-white";

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
  const [uploadError, setUploadError] = useState("");

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
    if (!isPdfImageType(file.type)) {
      setUploadError(PDF_IMAGE_ERROR);
      return;
    }
    setUploadError("");
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-medium leading-snug">Signature</h3>
        {signature && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onChange(null)}
            className="text-destructive hover:text-destructive"
          >
            Remove
          </Button>
        )}
      </div>

      {/* Preview of current signature — click to edit */}
      {signature && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Edit signature"
          className={cn(
            PAPER,
            "block w-full p-3 text-left outline-none transition-shadow hover:ring-2 hover:ring-ring/30 focus-visible:ring-[3px] focus-visible:ring-ring/30"
          )}
        >
          {signature.type === "draw" || signature.type === "upload" ? (
            <img
              src={signature.data}
              alt="Signature"
              className="h-16 object-contain"
            />
          ) : (
            <span
              className="block"
              style={{
                fontFamily: `'${signature.fontFamily}', cursive`,
                color: signature.color || "#000",
                fontSize: "28px",
              }}
            >
              {signature.data}
            </span>
          )}
        </button>
      )}

      {!signature && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-4 text-sm text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <Pen className="size-4" />
          Add Signature
        </button>
      )}

      {/* Editor */}
      {open && (
        <div className="space-y-4 rounded-2xl bg-muted/50 p-4">
          {/* Tabs — each its own Tab stop, as the old buttons were */}
          <ToggleGroup
            type="single"
            rovingFocus={false}
            value={tab}
            onValueChange={(v) => {
              if (v) setTab(v as Tab);
            }}
            aria-label="Signature method"
            className={cn("w-full", SEGMENT_TRACK)}
          >
            {tabs.map((t) => (
              <ToggleGroupItem key={t.id} value={t.id} className={cn(SEGMENT_ITEM, "min-w-0 flex-1 gap-1.5")}>
                <t.icon className="size-3.5" />
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Color selector */}
          {(tab === "draw" || tab === "type") && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Color:</span>
              {SIGNATURE_COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setSelectedColor(c.color)}
                  aria-label={c.name}
                  aria-pressed={selectedColor === c.color}
                  className={cn(
                    "size-6 rounded-full border-2 outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    selectedColor === c.color
                      ? "scale-110 border-foreground"
                      : "border-foreground/15 hover:scale-105"
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
                className={cn(PAPER, "w-full cursor-crosshair touch-none")}
                style={{ height: "120px" }}
              />
              <Button type="button" variant="ghost" size="xs" onClick={clearCanvas} className="-ml-2.5">
                <Trash2 />
                Clear
              </Button>
            </div>
          )}

          {/* Type tab */}
          {tab === "type" && (
            <div className="space-y-3">
              <Input
                type="text"
                aria-label="Typed signature"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Type your signature"
              />
              <div className="flex flex-wrap gap-2">
                {SIGNATURE_FONTS.map((f) => (
                  <Button
                    key={f.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedFont(f.name)}
                    aria-pressed={selectedFont === f.name}
                    className="text-sm font-normal aria-pressed:border-foreground aria-pressed:bg-muted"
                    style={{ fontFamily: `'${f.name}', cursive` }}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
              {typedText && (
                <div className={cn(PAPER, "p-3")}>
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
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-foreground/15 py-6 text-sm text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
              >
                <Upload className="size-5" />
                Upload signature image
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={PDF_IMAGE_ACCEPT}
                onChange={handleFileUpload}
                className="hidden"
              />
              {uploadError && (
                <p role="alert" className="text-xs text-destructive">
                  {uploadError}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {tab !== "upload" && (
              <Button
                type="button"
                size="sm"
                onClick={tab === "draw" ? handleSaveDrawn : handleSaveTyped}
              >
                Save Signature
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
