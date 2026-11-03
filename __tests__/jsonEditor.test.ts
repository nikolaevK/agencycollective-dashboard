import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  ALLOWED_USE_CASES,
  ALLOWED_ROLES,
  USE_CASE_META,
  isUseCase,
  isImageRole,
  metaForUseCase,
} from "@/lib/jsonEditor/useCases";
import { analysisSchema, fieldGuide, type JsonSchema } from "@/lib/jsonEditor/schemas";
import {
  diffJson,
  formatChange,
  jsonEqual,
  parseJsonObject,
  previewValue,
  MAX_DIFF_ENTRIES,
  type JsonObject,
} from "@/lib/jsonEditor/diff";
import { analysisSystemPrompt, generationPrompt } from "@/lib/jsonEditor/prompts";
import {
  applyPatch,
  applyReference,
  canApplyReference,
  presetsFor,
  swapTargets,
  USE_CASE_PRESETS,
} from "@/lib/jsonEditor/presets";
import {
  canSendAsIs,
  detectImageType,
  fitWithin,
  MAX_JSON_BYTES,
  nearestAspectRatio,
  UPLOAD_IMAGE_BUDGET_BYTES,
  UPLOAD_MAX_EDGE,
  utf8ByteLength,
} from "@/lib/jsonEditor/images";
import { readImageUpload, readUploadForm } from "@/lib/jsonEditor/serverImage";
import { describeHttpFailure, imageBlockMessage, refusalMessage } from "@/lib/jsonEditor/errors";
import { DEFAULT_RESOLUTION } from "@/lib/jsonEditor/models";
import { DEFAULT_GEMINI_IMAGE_MODEL, clampImageSize, geminiImageModelInfo } from "@/lib/geminiModels";

// ─── Use cases ───────────────────────────────────────────────────────────

describe("use cases", () => {
  it("lists the same ids in ALLOWED_USE_CASES and USE_CASE_META", () => {
    expect(USE_CASE_META.map((m) => m.id)).toEqual([...ALLOWED_USE_CASES]);
    for (const id of ALLOWED_USE_CASES) expect(metaForUseCase(id).id).toBe(id);
  });

  it("validates untrusted values", () => {
    expect(isUseCase("colors")).toBe(true);
    expect(isUseCase("Colors")).toBe(false);
    expect(isUseCase(null)).toBe(false);
    expect(isImageRole("reference")).toBe(true);
    expect(isImageRole("ref")).toBe(false);
  });

  it("names a reference uploader for every use case that needs one", () => {
    for (const m of USE_CASE_META) {
      if (m.requiresReference) expect(m.referenceLabel).toBeTruthy();
    }
  });
});

// ─── Structured-output schemas ───────────────────────────────────────────

/** Walks a schema; returns problems that would 400 or burn the optional-property budget. */
function strictProblems(schema: JsonSchema, path = "$"): string[] {
  const out: string[] = [];
  const raw = schema as unknown as Record<string, unknown>;
  for (const banned of ["anyOf", "oneOf", "minimum", "maximum", "minLength", "maxLength", "pattern"]) {
    if (banned in raw) out.push(`${path}: uses ${banned}`);
  }
  if (Array.isArray(raw.type)) out.push(`${path}: type array`);
  if (schema.type === "object") {
    if (schema.additionalProperties !== false) out.push(`${path}: additionalProperties must be false`);
    const keys = Object.keys(schema.properties);
    if (keys.length === 0) out.push(`${path}: empty object`);
    if ([...keys].sort().join() !== [...schema.required].sort().join()) {
      out.push(`${path}: every property must be required`);
    }
    for (const k of keys) out.push(...strictProblems(schema.properties[k], `${path}.${k}`));
  } else if (schema.type === "array") {
    out.push(...strictProblems(schema.items, `${path}[]`));
  }
  return out;
}

describe("analysis schemas", () => {
  it("are valid strict structured-output schemas (no optional props, no unions)", () => {
    for (const uc of ALLOWED_USE_CASES) {
      for (const role of ALLOWED_ROLES) {
        const schema = analysisSchema(uc, role);
        expect(schema.type).toBe("object");
        expect(strictProblems(schema), `${uc}/${role}`).toEqual([]);
      }
    }
  });

  it("keeps the field names the editor and presets rely on", () => {
    const colors = analysisSchema("colors", "source");
    expect(colors.type === "object" && Object.keys(colors.properties)).toEqual([
      "scene_description",
      "style",
      "objects",
      "background",
      "overall_palette",
    ]);
    const ref = analysisSchema("object-swap", "reference");
    expect(ref.type === "object" && Object.keys(ref.properties)).toEqual(["reference_object"]);
  });

  it("builds a field guide with array paths", () => {
    const guide = fieldGuide(analysisSchema("colors", "source"));
    const paths = guide.map((g) => g.path);
    expect(paths).toContain("objects[].color");
    expect(paths).toContain("background.walls.color");
    expect(guide.every((g) => g.description.length > 0)).toBe(true);
  });
});

// ─── Diff ────────────────────────────────────────────────────────────────

describe("parseJsonObject", () => {
  it("accepts objects only", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonObject("[1,2]").ok).toBe(false);
    expect(parseJsonObject("null").ok).toBe(false);
    expect(parseJsonObject('"x"').ok).toBe(false);
    expect(parseJsonObject("").ok).toBe(false);
    const bad = parseJsonObject("{a:1}");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.length).toBeGreaterThan(0);
  });
});

describe("diffJson", () => {
  const base: JsonObject = {
    scene_description: "A living room",
    objects: [
      { name: "sofa", color: "cream" },
      { name: "lamp", color: "brass" },
    ],
    background: { walls: { color: "white" } },
  };

  it("ignores formatting and key order", () => {
    const reordered = parseJsonObject(
      JSON.stringify({ background: { walls: { color: "white" } }, objects: base.objects, scene_description: "A living room" })
    );
    expect(reordered.ok && diffJson(base, reordered.value)).toEqual([]);
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("reports leaf changes with paths", () => {
    const next = structuredClone(base) as JsonObject & { objects: JsonObject[] };
    next.objects[0].color = "light blue velvet";
    expect(diffJson(base, next)).toEqual([
      { kind: "changed", path: "objects[0].color", before: "cream", after: "light blue velvet" },
    ]);
  });

  it("reports added and removed keys and array items, with their values", () => {
    const next = structuredClone(base) as JsonObject & { objects: JsonObject[] };
    next.objects.push({ name: "rug", color: "red" });
    delete (next as JsonObject).scene_description;
    (next.background as JsonObject).floor = { color: "oak" };
    const changes = diffJson(base, next);
    expect(changes).toContainEqual({ kind: "removed", path: "scene_description", before: "A living room" });
    expect(changes).toContainEqual({ kind: "added", path: "objects[2]", after: { name: "rug", color: "red" } });
    expect(changes).toContainEqual({ kind: "added", path: "background.floor", after: { color: "oak" } });
    expect(formatChange({ kind: "added", path: "objects[2]", after: { name: "rug" } })).toBe(
      'Added objects[2]: {"name":"rug"}'
    );
  });

  it("treats a type change as a change", () => {
    expect(diffJson({ a: { b: 1 } }, { a: "flat" })).toEqual([
      { kind: "changed", path: "a", before: { b: 1 }, after: "flat" },
    ]);
  });

  it("caps the number of entries", () => {
    const before: JsonObject = {};
    const after: JsonObject = {};
    for (let i = 0; i < MAX_DIFF_ENTRIES + 50; i++) {
      before[`k${i}`] = i;
      after[`k${i}`] = i + 1;
    }
    expect(diffJson(before, after)).toHaveLength(MAX_DIFF_ENTRIES);
  });

  it("only counts a JSON object's own keys", () => {
    expect(diffJson({}, { constructor: "x" })).toEqual([{ kind: "added", path: "constructor", after: "x" }]);
    expect(diffJson({ toString: "a" }, {})).toEqual([{ kind: "removed", path: "toString", before: "a" }]);
    expect(diffJson({ a: { hasOwnProperty: 1 } }, { a: { hasOwnProperty: 2 } })).toEqual([
      { kind: "changed", path: "a.hasOwnProperty", before: 1, after: 2 },
    ]);
    expect(jsonEqual({ constructor: 1 }, { valueOf: 1 })).toBe(false);
  });

  it("previews long values with an ellipsis", () => {
    const s = previewValue("x".repeat(500), 20);
    expect(s.length).toBe(20);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("diffJson arrays of objects", () => {
  const room = (): JsonObject & { objects: JsonObject[] } => ({
    objects: Array.from({ length: 30 }, (_, i) => ({
      name: `object ${i}`,
      color: `color ${i}`,
      material: i % 2 ? "oak" : "linen",
      position: { x: "left", y: "foreground" },
    })),
  });

  it("reports deleting the first of 30 objects as one removal", () => {
    const before = room();
    const after = room();
    after.objects.splice(0, 1);
    expect(diffJson(before, after)).toEqual([{ kind: "removed", path: "objects[0]", before: before.objects[0] }]);
  });

  it("ignores reordering", () => {
    const before = room();
    const after = room();
    after.objects.reverse();
    expect(diffJson(before, after)).toEqual([]);
  });

  it("reports one edited field at the item's place in the modified JSON", () => {
    const before = room();
    const after = room();
    after.objects.splice(0, 1);
    after.objects[4].color = "light blue velvet"; // was objects[5]
    expect(diffJson(before, after)).toEqual([
      { kind: "changed", path: "objects[4].color", before: "color 5", after: "light blue velvet" },
      { kind: "removed", path: "objects[0]", before: before.objects[0] },
    ]);
  });

  it("pairs an item whose name (or text) changed with its original", () => {
    const before = room();
    const after = room();
    after.objects[2] = { ...after.objects[2], name: "wingback chair", color: "cognac" };
    after.objects.splice(10, 1);
    expect(diffJson(before, after)).toEqual([
      { kind: "changed", path: "objects[2].name", before: "object 2", after: "wingback chair" },
      { kind: "changed", path: "objects[2].color", before: "color 2", after: "cognac" },
      { kind: "removed", path: "objects[10]", before: before.objects[10] },
    ]);

    const text = { text_elements: [{ content: "SALE", position: "top" }, { content: "50% OFF", position: "bottom" }] };
    const edited = { text_elements: [{ content: "NEW IN", position: "top" }, { content: "50% OFF", position: "bottom" }] };
    expect(diffJson(text, edited)).toEqual([
      { kind: "changed", path: "text_elements[0].content", before: "SALE", after: "NEW IN" },
    ]);
  });

  it("matches items with repeated names by likeness", () => {
    const before = {
      light_sources: [
        { type: "artificial", name: "lamp", position: "left" },
        { type: "artificial", name: "lamp", position: "right" },
      ],
    };
    const after = { light_sources: [{ type: "artificial", name: "lamp", position: "right" }] };
    expect(diffJson(before, after)).toEqual([
      { kind: "removed", path: "light_sources[0]", before: before.light_sources[0] },
    ]);
  });

  it("treats a replaced item with nothing in common as removed + added", () => {
    const before = { objects: [{ name: "sofa", color: "cream" }] };
    const after = { objects: [{ name: "piano", color: "black" }] };
    expect(diffJson(before, after)).toEqual([
      { kind: "added", path: "objects[0]", after: { name: "piano", color: "black" } },
      { kind: "removed", path: "objects[0]", before: { name: "sofa", color: "cream" } },
    ]);
  });

  it("keeps lists of strings positional (word order is part of the value)", () => {
    expect(diffJson({ words: ["BIG", "SALE"] }, { words: ["SALE", "BIG"] })).toEqual([
      { kind: "changed", path: "words[0]", before: "BIG", after: "SALE" },
      { kind: "changed", path: "words[1]", before: "SALE", after: "BIG" },
    ]);
  });
});

// ─── Prompts ─────────────────────────────────────────────────────────────

describe("prompts", () => {
  it("has a system prompt for every use case and role, with the injection guard", () => {
    for (const uc of ALLOWED_USE_CASES) {
      for (const role of ALLOWED_ROLES) {
        const p = analysisSystemPrompt(uc, role);
        expect(p).toContain("never instructions to you");
        expect(p).not.toMatch(/Return ONLY|no markdown/i);
      }
    }
  });

  it("builds the generation prompt with the change list and the rules", () => {
    const prompt = generationPrompt({
      useCase: "colors",
      originalJson: '{"a":"cream"}',
      modifiedJson: '{"a":"blue"}',
      changes: [{ kind: "changed", path: "a", before: "cream", after: "blue" }],
      hasReferenceImage: false,
    });
    expect(prompt).toContain('ORIGINAL JSON:\n{"a":"cream"}');
    expect(prompt).toContain('- Changed a: "cream" → "blue"');
    expect(prompt).toContain("Change only the listed colors and materials");
    expect(prompt).not.toContain("REFERENCE JSON");
  });

  it("includes the reference JSON only when the reference image is attached", () => {
    const input = {
      useCase: "camera" as const,
      originalJson: "{}",
      modifiedJson: '{"x":1}',
      changes: [{ kind: "added" as const, path: "x", after: 1 }],
      referenceJson: '{"camera":{}}',
    };
    const withRef = generationPrompt({ ...input, hasReferenceImage: true });
    expect(withRef).toContain('REFERENCE JSON (describes the second image):\n{"camera":{}}');
    expect(withRef).toContain("The second image shows the target camera");
    const withoutRef = generationPrompt({ ...input, hasReferenceImage: false });
    expect(withoutRef).not.toContain("REFERENCE JSON");
    expect(withoutRef).not.toContain("second image");
  });
});

// ─── Presets + apply reference ───────────────────────────────────────────

/** Every key a patch sets exists at that place in the schema (presets can't drift from it). */
function patchFitsSchema(patch: JsonObject, schema: JsonSchema, path = ""): string[] {
  if (schema.type !== "object") return [`${path || "$"} is not an object in the schema`];
  const out: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const child = schema.properties[k];
    if (!child) {
      out.push(`${path}${k} is not in the schema`);
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...patchFitsSchema(v as JsonObject, child, `${path}${k}.`));
  }
  return out;
}

describe("presets", () => {
  it("only patch fields the use case's schema has", () => {
    for (const [uc, presets] of Object.entries(USE_CASE_PRESETS)) {
      const schema = analysisSchema(uc as keyof typeof USE_CASE_PRESETS, "source");
      for (const p of presets ?? []) expect(patchFitsSchema(p.patch, schema), `${uc}/${p.id}`).toEqual([]);
    }
    expect(presetsFor("colors")).toEqual([]);
  });

  it("deep-merges without touching the input", () => {
    const target: JsonObject = { a: { b: 1, c: 2 }, d: [1], e: "keep" };
    const out = applyPatch(target, { a: { b: 9 }, d: [2, 3] });
    expect(out).toEqual({ a: { b: 9, c: 2 }, d: [2, 3], e: "keep" });
    expect(target).toEqual({ a: { b: 1, c: 2 }, d: [1], e: "keep" });
  });
});

describe("applyReference", () => {
  it("copies the camera fields and keeps the scene description", () => {
    const scene = { scene_description: "kitchen", camera: { height: "eye-level" }, lens: { distortion: "none" } };
    const ref = {
      scene_description: "street",
      camera: { height: "low" },
      lens: { distortion: "strong-barrel" },
      perspective: { type: "fisheye" },
      composition: { framing: "tight" },
    };
    const out = applyReference("camera", scene, ref);
    expect(out).toEqual({
      ok: true,
      value: {
        scene_description: "kitchen",
        camera: { height: "low" },
        lens: { distortion: "strong-barrel" },
        perspective: { type: "fisheye" },
        composition: { framing: "tight" },
      },
    });
    expect(applyReference("camera", scene, { foo: 1 }).ok).toBe(false);
  });

  it("swaps the chosen object, keeping where it sits", () => {
    const scene = {
      objects: [
        { name: "armchair", type: "furniture", color: "grey", material: "linen", position: { x: "left" }, overlaps_with: ["rug"] },
        { name: "lamp", color: "brass" },
      ],
    };
    const ref = {
      reference_object: {
        name: "wingback chair",
        type: "furniture",
        color: "cognac",
        material: "leather",
        finish: "satin",
        style: "classic",
        shape_description: "tall back",
        proportions: { width_to_height_ratio: "0.8:1", overall_form: "tall" },
        notable_features: ["nailhead trim"],
        orientation_in_image: "facing left",
      },
    };
    const out = applyReference("object-swap", scene, ref, 0);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const swapped = (out.value.objects as JsonObject[])[0];
    expect(swapped).toMatchObject({
      name: "wingback chair",
      color: "cognac",
      material: "leather",
      position: { x: "left" },
      overlaps_with: ["rug"],
    });
    expect(swapped.replacement_details).toMatchObject({ finish: "satin", notable_features: ["nailhead trim"] });
    expect((out.value.objects as JsonObject[])[1]).toEqual({ name: "lamp", color: "brass" });
    expect(diffJson(scene, out.value).length).toBeGreaterThan(0);

    expect(applyReference("object-swap", scene, ref).ok).toBe(false);
    expect(applyReference("object-swap", scene, ref, 5).ok).toBe(false);
    expect(applyReference("object-swap", { objects: [] }, ref, 0).ok).toBe(false);
    expect(applyReference("object-swap", scene, {}, 0).ok).toBe(false);
    expect(applyReference("colors", scene, ref).ok).toBe(false);
  });

  it("lists swap targets with fallbacks for unnamed objects", () => {
    expect(swapTargets({ objects: [{ name: "sofa" }, { color: "red" }, "junk"] })).toEqual([
      { index: 0, name: "sofa" },
      { index: 1, name: "Object 2" },
      { index: 2, name: "Object 3" },
    ]);
    expect(swapTargets({})).toEqual([]);
    expect(canApplyReference("camera")).toBe(true);
    expect(canApplyReference("weather")).toBe(false);
  });
});

// ─── Images ──────────────────────────────────────────────────────────────

const bytes = (...xs: number[]) => new Uint8Array([...xs, ...new Array(16).fill(0)]);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

describe("image rules", () => {
  it("detects the real type from magic bytes", () => {
    expect(detectImageType(bytes(0x89, ...ascii("PNG")))).toBe("image/png");
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectImageType(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")))).toBe("image/webp");
    expect(detectImageType(bytes(...ascii("GIF89a")))).toBeNull();
    expect(detectImageType(bytes(...ascii("<svg ")))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });

  it("scales down to the longest edge, never up", () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(1000, 3000, 2048)).toEqual({ width: 683, height: 2048 });
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });

  it("sends small supported files as-is", () => {
    const dims = { width: 1600, height: 1200 };
    expect(canSendAsIs({ type: "image/jpeg", size: 500_000 }, dims)).toBe(true);
    expect(canSendAsIs({ type: "image/gif", size: 500_000 }, dims)).toBe(false);
    expect(canSendAsIs({ type: "image/png", size: UPLOAD_IMAGE_BUDGET_BYTES + 1 }, dims)).toBe(false);
    expect(canSendAsIs({ type: "image/png", size: 1000 }, { width: UPLOAD_MAX_EDGE + 1, height: 10 })).toBe(false);
  });

  it("keeps two images under the 4.5 MB request cap", () => {
    expect(2 * UPLOAD_IMAGE_BUDGET_BYTES + 3 * MAX_JSON_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  it("measures JSON in UTF-8 bytes, not UTF-16 units", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("→")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
    const accented = "é".repeat(MAX_JSON_BYTES / 2 + 1);
    expect(accented.length).toBeLessThan(MAX_JSON_BYTES);
    expect(utf8ByteLength(accented)).toBeGreaterThan(MAX_JSON_BYTES);
  });

  it("picks the supported aspect ratio nearest the source's shape", () => {
    const ratios = geminiImageModelInfo(DEFAULT_GEMINI_IMAGE_MODEL).aspectRatios;
    expect(nearestAspectRatio(1600, 1200, ratios)).toBe("4:3");
    expect(nearestAspectRatio(1080, 1920, ratios)).toBe("9:16");
    expect(nearestAspectRatio(1024, 1000, ratios)).toBe("1:1");
    expect(nearestAspectRatio(1080, 1350, ratios)).toBe("4:5");
    expect(nearestAspectRatio(3000, 1000, ["1:1", "16:9", "21:9"])).toBe("21:9");
    expect(nearestAspectRatio(0, 100, ratios)).toBeNull();
    expect(nearestAspectRatio(100, 100, [])).toBeNull();
  });
});

describe("server uploads", () => {
  it("reads a multipart form under the byte cap and refuses one over it", async () => {
    const form = new FormData();
    form.append("useCase", "colors");
    form.append("image", new Blob([new Uint8Array(64)], { type: "image/png" }), "a.png");
    // Serialized once, then sent as plain bytes — like a body off the socket.
    const encoded = new Request("http://localhost/", { method: "POST", body: form });
    const contentType = encoded.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await encoded.arrayBuffer());
    const post = (headers: Record<string, string> = {}) =>
      new Request("http://localhost/api/json-editor/analyze", {
        method: "POST",
        body: bytes,
        headers: { "content-type": contentType, ...headers },
      });

    const read = await readUploadForm(post(), 10_000);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.form.get("useCase")).toBe("colors");
      expect(read.form.get("image")).toBeInstanceOf(File);
    }
    expect(await readUploadForm(post(), 100)).toEqual({ ok: false, status: 413 });
    expect(await readUploadForm(post({ "content-length": "999999999" }), 10_000)).toEqual({ ok: false, status: 413 });
    const notAForm = new Request("http://localhost/x", { method: "POST", body: "hello" });
    expect(await readUploadForm(notAForm, 10_000)).toEqual({ ok: false, status: 400 });
  });

  it("returns upright dimensions and refuses images over the pixel cap", async () => {
    const rotated = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#808080" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const upload = await readImageUpload(new File([new Uint8Array(rotated)], "r.jpg"), "Image");
    expect(upload).toMatchObject({ ok: true, type: "image/jpeg", width: 20, height: 40 });

    // A tiny JPEG whose header claims 9000 × 9000 (81 MP) — refused from the header alone.
    const small = Buffer.from(
      await sharp({ create: { width: 16, height: 16, channels: 3, background: "#808080" } }).jpeg().toBuffer()
    );
    const sof = small.indexOf(Buffer.from([0xff, 0xc0]));
    expect(sof).toBeGreaterThan(0);
    small.writeUInt16BE(9000, sof + 5);
    small.writeUInt16BE(9000, sof + 7);
    const huge = await readImageUpload(new File([new Uint8Array(small)], "h.jpg"), "Image");
    expect(huge).toMatchObject({ ok: false, status: 413 });
  });
});

// ─── Errors + models ─────────────────────────────────────────────────────

describe("error copy", () => {
  it("prefers the route's error, else explains the status", () => {
    expect(describeHttpFailure(400, { error: "Invalid use case" }, "x")).toBe("Invalid use case");
    expect(describeHttpFailure(413, null, "x")).toMatch(/too large/);
    expect(describeHttpFailure(504, "<html>", "x")).toMatch(/timed out/);
    expect(describeHttpFailure(418, null, "Generation failed")).toBe("Generation failed");
  });

  it("maps refusals and image blocks to calm messages", () => {
    expect(refusalMessage("cyber")).toMatch(/usage policy/);
    expect(refusalMessage(null)).toMatch(/declined/);
    expect(imageBlockMessage("IMAGE_SAFETY")).toMatch(/safety/);
    expect(imageBlockMessage("NO_IMAGE")).toMatch(/didn't produce/);
    expect(imageBlockMessage("STOP")).toBeNull();
    expect(imageBlockMessage(undefined)).toBeNull();
  });
});

describe("resolution default", () => {
  it("is a size the default model takes", () => {
    expect(clampImageSize(DEFAULT_GEMINI_IMAGE_MODEL, DEFAULT_RESOLUTION)).toBe(DEFAULT_RESOLUTION);
  });
});
