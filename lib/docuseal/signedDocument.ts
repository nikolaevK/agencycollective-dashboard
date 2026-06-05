import { docusealFetch } from "./client";
import { DocuSealSubmissionSchema } from "./schemas";
import { MAX_DOCUMENT_SIZE_BYTES } from "@/lib/payoutDocuments";

/** The contract fields needed to resolve a signed PDF — satisfied by both the
 *  primary `DealContractRecord` and `DealAdditionalContractRecord`. */
export interface SignedContractRef {
  documentUrls: string[] | null;
  docusealSubmissionId: number | null;
}

/**
 * Guard the outbound document fetch: HTTPS only, and never a loopback /
 * private / link-local / cloud-metadata host. The URLs come from DocuSeal API
 * responses or our own stored `document_urls` rows (semi-trusted), so this is
 * defense-in-depth against an SSRF via a poisoned/unexpected URL.
 */
function isPublicHttpsUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return false; // this-host / private / loopback
    if (a === 169 && b === 254) return false; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
  }
  // IPv6 loopback / link-local / unique-local literals.
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return false;
  }
  return true;
}

/**
 * Download a URL as PDF bytes, enforcing the same size ceiling as a manual
 * upload. Returns null (never throws) on any failure. Logs are URL-free: the
 * DocuSeal signed link embeds a short-lived token in its path, so we log only
 * the HTTP status / error name, never the URL itself.
 */
async function downloadPdf(url: string): Promise<Buffer | null> {
  if (!isPublicHttpsUrl(url)) {
    console.warn("[signedDocument] Blocked non-public document URL; trying next candidate.");
    return null;
  }
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(
        `[signedDocument] Signed PDF link returned ${res.status}; trying next candidate.`
      );
      return null;
    }
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_DOCUMENT_SIZE_BYTES) {
      console.warn("[signedDocument] Signed PDF exceeds size limit (Content-Length); skipping.");
      return null;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_DOCUMENT_SIZE_BYTES) return null;
    return bytes;
  } catch (err) {
    console.warn(
      "[signedDocument] Signed PDF download failed; trying next candidate:",
      err instanceof Error ? err.name : "unknown error"
    );
    return null;
  }
}

/**
 * Resolve the signed PDF bytes for a deal's DocuSeal contract so the caller can
 * store them locally (e.g. as a payout `project_scope` document).
 *
 * Resolution order, trying each candidate until one downloads successfully:
 *   1. Live `GET /submissions/{id}` — `combined_document_url` + per-submitter
 *      document URLs. Preferred because DocuSeal document links are short-lived
 *      signed URLs; a fresh one issued right before download reliably works,
 *      whereas the stored link (captured at signing) is usually expired by the
 *      time an admin imports the deal.
 *   2. `contract.documentUrls` — the stored links, used only as a fallback when
 *      there is no submission id or the live fetch yields nothing.
 *
 * Returns `null` (never throws) on any failure — the importer turns that into a
 * non-blocking warning so the payout entry is still created.
 */
export async function fetchSignedContractPdf(
  contract: SignedContractRef
): Promise<Buffer | null> {
  // 1. Fresh URLs from a live submission fetch (the reliable path).
  if (contract.docusealSubmissionId) {
    try {
      const submission = await docusealFetch(
        `/submissions/${contract.docusealSubmissionId}`,
        DocuSealSubmissionSchema,
        { retries: 1 }
      );
      const fresh: string[] = [];
      if (submission.combined_document_url) {
        fresh.push(submission.combined_document_url);
      }
      for (const submitter of submission.submitters ?? []) {
        for (const d of submitter.documents ?? []) {
          if (d.url) fresh.push(d.url);
        }
      }
      for (const url of fresh) {
        const bytes = await downloadPdf(url);
        if (bytes) return bytes;
      }
    } catch (err) {
      console.error(
        "[signedDocument] submission fetch failed:",
        err instanceof Error ? err.message : "unknown error"
      );
    }
  }

  // 2. Fall back to the stored links (only useful if still within their TTL).
  for (const url of contract.documentUrls ?? []) {
    const bytes = await downloadPdf(url);
    if (bytes) return bytes;
  }

  return null;
}
