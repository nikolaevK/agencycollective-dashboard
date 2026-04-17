import { z } from "zod";

const DEFAULT_API_URL = "https://api.docuseal.com";

function getApiUrl(): string {
  return process.env.DOCUSEAL_API_URL || DEFAULT_API_URL;
}

function getApiKey(): string {
  const key = process.env.DOCUSEAL_API_KEY;
  if (!key) throw new DocuSealAuthError("DOCUSEAL_API_KEY is not configured");
  return key;
}

// --- Error classes ---

export class DocuSealAuthError extends Error {
  readonly code = 401;
  constructor(message = "DocuSeal API key is invalid or not configured") {
    super(message);
    this.name = "DocuSealAuthError";
  }
}

export class DocuSealApiError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "DocuSealApiError";
    this.statusCode = statusCode;
  }
}

// --- Core fetch helpers ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function docusealFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  options: { params?: Record<string, string | number | boolean | undefined>; retries?: number } = {}
): Promise<T> {
  const { params = {}, retries = 3 } = options;
  const base = getApiUrl();
  const key = getApiKey();

  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        headers: {
          "X-Auth-Token": key,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        throw new DocuSealAuthError();
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
        throw new DocuSealApiError(`Rate limit exceeded. Retry after ${retryAfter}s`, 429);
      }

      if (response.status >= 500 && attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      const body = await response.json();

      if (!response.ok) {
        const msg = body?.error || body?.message || `HTTP ${response.status}`;
        throw new DocuSealApiError(String(msg), response.status);
      }

      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        console.error("[DocuSeal] Zod validation error:", parsed.error.flatten());
        throw new DocuSealApiError(`Response validation failed: ${parsed.error.message}`, 0);
      }

      return parsed.data;
    } catch (err) {
      if (err instanceof DocuSealAuthError) throw err;
      if (err instanceof DocuSealApiError && err.statusCode === 429) throw err;

      if (attempt < retries && !(err instanceof DocuSealApiError)) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw err;
    }
  }

  throw new DocuSealApiError("Max retries exceeded", 0);
}

export async function docusealPost<T>(
  path: string,
  body: Record<string, unknown>,
  schema: z.ZodType<T>,
  options: { retries?: number } = {}
): Promise<T> {
  const { retries = 3 } = options;
  const base = getApiUrl();
  const key = getApiKey();

  const url = `${base}${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-Auth-Token": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        throw new DocuSealAuthError();
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
        throw new DocuSealApiError(`Rate limit exceeded. Retry after ${retryAfter}s`, 429);
      }

      if (response.status >= 500 && attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      const parsed = await response.json();

      if (!response.ok) {
        const msg = parsed?.error || parsed?.message || `HTTP ${response.status}`;
        throw new DocuSealApiError(String(msg), response.status);
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        console.error("[DocuSeal] Zod validation error (POST):", validated.error.flatten());
        throw new DocuSealApiError(`Response validation failed: ${validated.error.message}`, 0);
      }

      return validated.data;
    } catch (err) {
      if (err instanceof DocuSealAuthError) throw err;
      if (err instanceof DocuSealApiError && err.statusCode === 429) throw err;
      // Don't retry 4xx client errors — they won't succeed on retry
      if (err instanceof DocuSealApiError && err.statusCode >= 400 && err.statusCode < 500) throw err;

      if (attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw err;
    }
  }

  throw new DocuSealApiError("Max retries exceeded", 0);
}

const CloneTemplateResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
});

/**
 * Clone a DocuSeal template so edits don't affect existing submissions.
 * Returns the new cloned template's id and name.
 */
export async function docusealCloneTemplate(
  templateId: number,
  name?: string
): Promise<{ id: number; name: string }> {
  return docusealPost(
    `/templates/${templateId}/clone`,
    { name: name || undefined },
    CloneTemplateResponseSchema
  );
}

const UpdateTemplateResponseSchema = z.object({
  id: z.number(),
}).passthrough();

export async function docusealUpdateTemplate(
  templateId: number,
  fields: { name: string }
): Promise<{ id: number }> {
  return docusealPut(
    `/templates/${templateId}`,
    fields,
    UpdateTemplateResponseSchema
  );
}

const ArchiveSubmissionResponseSchema = z.object({
  id: z.number(),
  archived_at: z.string().nullable().optional(),
}).passthrough();

/**
 * Archive a DocuSeal submission. Archiving is reversible — the submission is
 * moved to the archive folder and the signing link is invalidated. Use this
 * when an admin removes an additional contract locally so the client can no
 * longer use the signing link that was previously sent.
 */
export async function docusealArchiveSubmission(
  submissionId: number
): Promise<{ id: number; archived_at?: string | null }> {
  const base = getApiUrl();
  const key = getApiKey();
  const url = `${base}/submissions/${submissionId}`;

  const retries = 3;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: { "X-Auth-Token": key, "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        throw new DocuSealAuthError();
      }
      if (response.status === 404) {
        throw new DocuSealApiError("Submission not found", 404);
      }
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
        throw new DocuSealApiError(`Rate limit exceeded. Retry after ${retryAfter}s`, 429);
      }
      if (response.status >= 500 && attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      const body = await response.json();
      if (!response.ok) {
        const msg = body?.error || body?.message || `HTTP ${response.status}`;
        throw new DocuSealApiError(String(msg), response.status);
      }

      const parsed = ArchiveSubmissionResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new DocuSealApiError(`Response validation failed: ${parsed.error.message}`, 0);
      }
      return parsed.data;
    } catch (err) {
      if (err instanceof DocuSealAuthError) throw err;
      if (err instanceof DocuSealApiError) throw err;
      if (attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new DocuSealApiError("Max retries exceeded", 0);
}

export async function docusealPut<T>(
  path: string,
  body: Record<string, unknown>,
  schema: z.ZodType<T>,
  options: { retries?: number } = {}
): Promise<T> {
  const { retries = 3 } = options;
  const base = getApiUrl();
  const key = getApiKey();

  const url = `${base}${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "X-Auth-Token": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        throw new DocuSealAuthError();
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
        throw new DocuSealApiError(`Rate limit exceeded. Retry after ${retryAfter}s`, 429);
      }

      if (response.status >= 500 && attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      const parsed = await response.json();

      if (!response.ok) {
        const msg = parsed?.error || parsed?.message || `HTTP ${response.status}`;
        throw new DocuSealApiError(String(msg), response.status);
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        console.error("[DocuSeal] Zod validation error (PUT):", validated.error.flatten());
        throw new DocuSealApiError(`Response validation failed: ${validated.error.message}`, 0);
      }

      return validated.data;
    } catch (err) {
      if (err instanceof DocuSealAuthError) throw err;
      if (err instanceof DocuSealApiError) throw err;

      if (attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw err;
    }
  }

  throw new DocuSealApiError("Max retries exceeded", 0);
}
