import { describe, it, expect } from "vitest";
import {
  ASSET_CHUNK_SIZE,
  acceptFor,
  canDeleteAsset,
  canUploadTo,
  chunkCountFor,
  expectedChunkLength,
  normalizeLinkUrl,
  parseRangeHeader,
  resolveMimeType,
  sniffMatches,
  titleFromFileName,
  validateUpload,
} from "@/lib/clientAssetRules";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("permissions", () => {
  it("lets clients upload only to My Brand; admins anywhere", () => {
    expect(canUploadTo("client", "brand")).toBe(true);
    expect(canUploadTo("client", "creative")).toBe(false);
    expect(canUploadTo("admin", "creative")).toBe(true);
  });

  it("lets clients delete only their own My Brand uploads", () => {
    expect(canDeleteAsset("client", { section: "brand", uploadedByRole: "client" })).toBe(true);
    expect(canDeleteAsset("client", { section: "brand", uploadedByRole: "admin" })).toBe(false);
    expect(canDeleteAsset("client", { section: "creative", uploadedByRole: "admin" })).toBe(false);
    expect(canDeleteAsset("admin", { section: "brand", uploadedByRole: "client" })).toBe(true);
  });
});

describe("validateUpload", () => {
  it("accepts allowed types under the cap", () => {
    expect(validateUpload({ category: "creative", mimeType: "video/mp4", fileSize: 50 * 1024 * 1024 })).toEqual({
      ok: true,
      mediaType: "video",
    });
    expect(validateUpload({ category: "brand_book", mimeType: "application/pdf", fileSize: 1 }).ok).toBe(true);
  });

  it("rejects wrong types per category, empty files and oversize files", () => {
    expect(validateUpload({ category: "product_photo", mimeType: "application/pdf", fileSize: 10 }).ok).toBe(false);
    expect(validateUpload({ category: "brand_book", mimeType: "image/svg+xml", fileSize: 10 }).ok).toBe(false);
    expect(validateUpload({ category: "creative", mimeType: "image/png", fileSize: 0 }).ok).toBe(false);
    expect(validateUpload({ category: "creative", mimeType: "image/png", fileSize: 26 * 1024 * 1024 }).ok).toBe(false);
    expect(validateUpload({ category: "creative", mimeType: "video/mp4", fileSize: 101 * 1024 * 1024 }).ok).toBe(false);
  });

  it("resolves a MIME type from the extension when the browser gives none", () => {
    expect(resolveMimeType("ad.MOV", "")).toBe("video/quicktime");
    expect(resolveMimeType("x.png", "image/png")).toBe("image/png");
    expect(resolveMimeType("page.html", "text/html")).toBeNull();
    expect(acceptFor("product_photo")).not.toContain("pdf");
  });
});

describe("sniffMatches", () => {
  it("recognises real magic bytes", () => {
    expect(sniffMatches("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(sniffMatches("image/png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(sniffMatches("image/webp", bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe(true);
    expect(sniffMatches("image/gif", bytes("GIF89a"))).toBe(true);
    expect(sniffMatches("application/pdf", bytes("%PDF-1.7"))).toBe(true);
    expect(sniffMatches("video/mp4", bytes(0, 0, 0, 0x20, "ftypisom"))).toBe(true);
    expect(sniffMatches("video/webm", bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
  });

  it("rejects a renamed HTML/SVG file", () => {
    expect(sniffMatches("image/png", bytes("<svg xmlns"))).toBe(false);
    expect(sniffMatches("image/jpeg", bytes("<html>"))).toBe(false);
    expect(sniffMatches("text/html", bytes("<html>"))).toBe(false);
  });
});

describe("chunk math", () => {
  it("splits a file into full chunks plus a remainder", () => {
    const size = ASSET_CHUNK_SIZE * 2 + 10;
    expect(chunkCountFor(size, ASSET_CHUNK_SIZE)).toBe(3);
    expect(expectedChunkLength(size, ASSET_CHUNK_SIZE, 0)).toBe(ASSET_CHUNK_SIZE);
    expect(expectedChunkLength(size, ASSET_CHUNK_SIZE, 2)).toBe(10);
    expect(expectedChunkLength(size, ASSET_CHUNK_SIZE, 3)).toBe(-1);
    expect(expectedChunkLength(size, ASSET_CHUNK_SIZE, -1)).toBe(-1);
    expect(expectedChunkLength(ASSET_CHUNK_SIZE, ASSET_CHUNK_SIZE, 0)).toBe(ASSET_CHUNK_SIZE);
  });
});

describe("parseRangeHeader", () => {
  it("handles closed, open-ended and suffix ranges", () => {
    expect(parseRangeHeader("bytes=0-1", 100)).toEqual({ start: 0, end: 1 });
    expect(parseRangeHeader("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
    expect(parseRangeHeader("bytes=-20", 100)).toEqual({ start: 80, end: 99 });
    expect(parseRangeHeader("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
  });

  it("ignores absent/malformed/multi ranges and flags unsatisfiable ones", () => {
    expect(parseRangeHeader(null, 100)).toBeNull();
    expect(parseRangeHeader("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRangeHeader("items=0-1", 100)).toBeNull();
    expect(parseRangeHeader("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=5-2", 100)).toBe("unsatisfiable");
  });
});

describe("links + titles", () => {
  it("allows only http(s) links and adds https:// to bare domains", () => {
    expect(normalizeLinkUrl("drive.google.com/drive/folders/abc")).toBe("https://drive.google.com/drive/folders/abc");
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("mailto:a@b.co")).toBeNull();
    expect(normalizeLinkUrl("not a link")).toBeNull();
  });

  it("derives a readable title from a file name", () => {
    expect(titleFromFileName("Peptide_Static_V3.png")).toBe("Peptide Static V3");
    expect(titleFromFileName("brand.book.pdf")).toBe("brand.book");
  });
});
