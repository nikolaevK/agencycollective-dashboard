import type { BadgeTone } from "@/components/ui/badge";

/** HTTP method → badge tone, shared by the docs sidebar and operation cards. */
export const METHOD_TONE: Record<string, BadgeTone> = {
  get: "info",
  post: "success",
  put: "warning",
  patch: "warning",
  delete: "danger",
};
