/**
 * Browser-side image prep for the JSON Editor: decodes a picked file and,
 * when it's too big for the request budget (or not a type the routes take,
 * e.g. GIF), redraws it at ≤ UPLOAD_MAX_EDGE px as WebP (JPEG where the
 * browser can't encode WebP) until it fits UPLOAD_IMAGE_BUDGET_BYTES.
 * Decoding through createImageBitmap with imageOrientation "from-image"
 * applies EXIF orientation, so a re-encoded phone photo is uploaded upright.
 */
import { canSendAsIs, fitWithin, UPLOAD_IMAGE_BUDGET_BYTES, UPLOAD_MAX_EDGE } from "@/lib/jsonEditor/images";

export interface PreparedImage {
  /** What gets uploaded (the original file when it already fits). */
  upload: File;
  width: number;
  height: number;
  /** The upload is a re-encoded / scaled copy of the picked file. */
  optimized: boolean;
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older browsers reject the option or its value — decode with their default orientation handling.
  }
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error("This image couldn't be read. Try a PNG, JPEG or WebP file.");
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(name: string, type: string): string {
  const ext = type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg";
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${ext}`;
}

export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const bitmap = await decode(file);
  try {
    const dims = { width: bitmap.width, height: bitmap.height };
    if (canSendAsIs(file, dims)) return { upload: file, ...dims, optimized: false };

    let { width, height } = fitWithin(dims.width, dims.height, UPLOAD_MAX_EDGE);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't process this image.");

    // A few quality steps, then smaller sizes, until it fits the budget.
    let webp = true;
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = width;
      canvas.height = height;
      // Resizing the canvas resets the context — set the downscale quality after it.
      ctx.imageSmoothingQuality = "high";
      for (const quality of [0.9, 0.82, 0.74]) {
        let blob: Blob | null = null;
        if (webp) {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(bitmap, 0, 0, width, height);
          blob = await toBlob(canvas, "image/webp", quality);
          // No WebP encoder (older Safari) hands back a PNG — fall back to JPEG.
          if (!blob || blob.type !== "image/webp") webp = false;
        }
        if (!webp) {
          // JPEG has no alpha — paint white under the image first.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(bitmap, 0, 0, width, height);
          blob = await toBlob(canvas, "image/jpeg", quality);
        }
        if (blob && blob.size <= UPLOAD_IMAGE_BUDGET_BYTES) {
          return {
            upload: new File([blob], renamed(file.name, blob.type), { type: blob.type }),
            width,
            height,
            optimized: true,
          };
        }
      }
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
    throw new Error("This image is too detailed to upload. Try a smaller image.");
  } finally {
    bitmap.close();
  }
}

/** A generated result (base64 from the API) as a Blob — object URLs beat data: URLs for memory. */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
