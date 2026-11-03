/**
 * User-facing error text for the JSON Editor — pure, shared by the routes
 * (refusal / block reasons) and the client (HTTP failures that never reach
 * the route's JSON error body, e.g. Vercel's 413 / 504 pages).
 */

/** Machine-readable `code` the routes put next to `error`. */
export type JsonEditorErrorCode =
  | "refusal"
  | "truncated"
  | "blocked"
  | "no_image"
  | "bad_output"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "model_unavailable"
  | "too_large";

/** Claude declined (stop_reason "refusal") — calm, actionable copy per category. */
export function refusalMessage(category: string | null | undefined): string {
  switch (category) {
    case "reasoning_extraction":
      return "The analysis was declined. Try again — if it repeats, try a different image.";
    case "cyber":
    case "bio":
    case "frontier_llm":
    case "general_harms":
      return "This image couldn't be analyzed under the AI provider's usage policy. Try a different image.";
    default:
      return "The image analysis was declined. Try again, or use a different image.";
  }
}

/** Gemini's finishReason / blockReason → what to tell the user (null = not a block). */
export function imageBlockMessage(reason: string | null | undefined): string | null {
  switch (reason) {
    case "SAFETY":
    case "IMAGE_SAFETY":
    case "PROHIBITED_CONTENT":
    case "IMAGE_PROHIBITED_CONTENT":
    case "BLOCKLIST":
    case "SPII":
    case "MODEL_ARMOR":
      return "The image model blocked this edit under its safety policy. Try a different change or image.";
    case "RECITATION":
    case "IMAGE_RECITATION":
      return "The image model stopped because the result was too close to existing content. Try a different change.";
    case "NO_IMAGE":
      return "The image model didn't produce an image for this edit. Try describing the change more concretely.";
    default:
      return null;
  }
}

/**
 * Message for a failed fetch to /api/json-editor/*. `body` is the parsed JSON
 * body if there was one — the routes always send `{ error }`, but Vercel's
 * own 413 / 504 pages aren't JSON.
 */
export function describeHttpFailure(status: number, body: unknown, fallback: string): string {
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  switch (status) {
    case 401:
      return "Your session has expired — sign in again.";
    case 403:
      return "You don't have access to the JSON Editor.";
    case 413:
      return "The images are too large to send. Try smaller images.";
    case 429:
      return "Too many requests — wait a minute and try again.";
    case 502:
    case 503:
    case 504:
      return "The request timed out or the service is unavailable. Try again.";
    default:
      return fallback;
  }
}
