/**
 * Output size default for the JSON Editor — pure. Which sizes a model takes
 * (and the clamping) is the shared Gemini registry's job (lib/geminiModels.ts).
 */
import type { GeminiImageSize } from "@/lib/geminiModels";

/**
 * 2K matches the ≤2048px source the editor uploads; 4K costs more, takes
 * longer and usually has to be re-compressed to fit the 4.5 MB response cap.
 * (The registry's own default — no size sent — is the model's largest.)
 */
export const DEFAULT_RESOLUTION: GeminiImageSize = "2K";
