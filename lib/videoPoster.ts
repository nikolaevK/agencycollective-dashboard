// Browser-only: grab a poster frame + dimensions + duration from a local video
// file before upload, so the gallery can show a tiny WebP thumbnail instead of
// making every visitor's browser download video bytes to draw a tile. The
// server never decodes video. Best-effort — codecs the browser can't decode
// (e.g. HEVC .mov in Chrome) just upload without a poster.

export interface VideoProbe {
  posterBase64: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

const EMPTY: VideoProbe = { posterBase64: null, width: null, height: null, durationMs: null };
const POSTER_MAX_EDGE = 960;
const TIMEOUT_MS = 8000;

function waitFor(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${event}`)), TIMEOUT_MS);
    el.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    el.addEventListener("error", () => { clearTimeout(timer); reject(new Error("video error")); }, { once: true });
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function probeVideo(file: File): Promise<VideoProbe> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    const loaded = waitFor(video, "loadeddata");
    video.src = url;
    await loaded;
    const width = video.videoWidth || null;
    const height = video.videoHeight || null;
    const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null;
    if (!width || !height) return { ...EMPTY, durationMs };

    // A frame a little way in — the very first one is often black.
    const t = Math.min(1, (video.duration || 0) / 4);
    if (t > 0) {
      const seeked = waitFor(video, "seeked");
      video.currentTime = t;
      await seeked;
    }
    const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return {
      posterBase64: blob ? await blobToBase64(blob) : null,
      width,
      height,
      durationMs,
    };
  } catch {
    return EMPTY;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
