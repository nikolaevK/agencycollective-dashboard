"use client";

import { useRef, useState, useEffect } from "react";
import { Camera } from "lucide-react";

interface AdminAvatarUploadProps {
  currentPath: string | null;
  initials: string;
  onFileSelect: (file: File) => void;
  previewUrl?: string | null;
}

export function AdminAvatarUpload({ currentPath, initials, onFileSelect, previewUrl }: AdminAvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const displayUrl = previewUrl ?? localPreview ?? currentPath;

  // Revoke old object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    if (file.size > 2 * 1024 * 1024) {
      alert("File too large (max 2 MB)");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["png", "jpg", "jpeg", "webp"].includes(ext ?? "")) {
      alert("Invalid file type. Allowed: PNG, JPG, WEBP");
      return;
    }

    setLocalPreview(URL.createObjectURL(file));
    onFileSelect(file);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative group h-20 w-20 rounded-full bg-primary/10 text-primary overflow-hidden"
      >
        {displayUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={displayUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xl font-bold">
            {initials}
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="h-5 w-5 text-white" />
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleChange}
        className="hidden"
      />
      <p className="text-xs text-muted-foreground">Click to upload avatar</p>
    </div>
  );
}
