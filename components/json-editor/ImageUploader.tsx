"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_BYTES = 20 * 1024 * 1024;

interface ImageUploaderProps {
  image: File | null;
  preview: string | null;
  onImageChange: (file: File | null, preview: string | null) => void;
  label: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ImageUploader({
  image,
  preview,
  onImageChange,
  label,
  required,
  disabled,
  className,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError("Unsupported file type. Use JPEG, PNG, WebP, or GIF.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError("File exceeds 20 MB limit.");
        return;
      }
      const url = URL.createObjectURL(file);
      onImageChange(file, url);
    },
    [onImageChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // reset so same file can be re-selected
      e.target.value = "";
    },
    [handleFile],
  );

  const handleRemove = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    onImageChange(null, null);
    setError(null);
  }, [preview, onImageChange]);

  if (image && preview) {
    return (
      <div className={cn("relative", className)}>
        <div className="text-xs font-medium text-muted-foreground mb-1.5">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </div>
        <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={label}
            className="w-full h-32 object-contain"
          />
          {!disabled && (
            <button
              onClick={handleRemove}
              className="absolute top-1.5 right-1.5 rounded-full bg-background/80 backdrop-blur-sm p-1 hover:bg-background transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 truncate">
          {image.name}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="text-xs font-medium text-muted-foreground mb-1.5">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-muted-foreground/50 hover:bg-muted/30",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <Upload className="h-5 w-5 text-muted-foreground mb-1.5" />
        <span className="text-xs text-muted-foreground text-center">
          Drop image or click to browse
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />
      </div>
      {error && (
        <div className="text-xs text-destructive mt-1">{error}</div>
      )}
    </div>
  );
}
