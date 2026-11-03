/**
 * One-click edits for the JSON Editor — pure. Presets patch the edited JSON
 * with a known look (weather, camera); "Apply reference" copies what the
 * reference image's analysis found into the scene JSON, so the change list
 * the image model receives names exactly what to transfer.
 */
import type { UseCase } from "./useCases";
import { isPlainObject, type JsonObject } from "./diff";

export interface JsonPreset {
  id: string;
  label: string;
  patch: JsonObject;
}

/** Deep-merges `patch` into `target` (objects merge, everything else is replaced). */
export function applyPatch(target: JsonObject, patch: JsonObject): JsonObject {
  const out: JsonObject = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? applyPatch(current, value) : value;
  }
  return out;
}

export const USE_CASE_PRESETS: Partial<Record<UseCase, readonly JsonPreset[]>> = {
  weather: [
    {
      id: "golden-hour",
      label: "Golden hour",
      patch: {
        time_of_day: "golden-hour",
        shadow_intensity: "soft",
        ambient_light: { color_temperature: "warm", color_tint: "golden amber", intensity: "soft" },
        atmosphere: { mood: "serene", haze: "slight", contrast: "medium" },
        sky_conditions: "sunset-glow",
      },
    },
    {
      id: "bright-midday",
      label: "Bright midday",
      patch: {
        time_of_day: "midday",
        shadow_intensity: "hard",
        ambient_light: { color_temperature: "neutral", color_tint: "clean white", intensity: "bright" },
        atmosphere: { mood: "energetic", haze: "none", contrast: "high" },
        sky_conditions: "clear",
      },
    },
    {
      id: "overcast",
      label: "Overcast",
      patch: {
        time_of_day: "afternoon",
        shadow_intensity: "none",
        ambient_light: { color_temperature: "cool", color_tint: "soft blue-gray", intensity: "soft" },
        atmosphere: { mood: "moody", haze: "slight", contrast: "low" },
        sky_conditions: "overcast",
      },
    },
    {
      id: "rainy-evening",
      label: "Rainy evening",
      patch: {
        time_of_day: "dusk",
        shadow_intensity: "soft",
        ambient_light: { color_temperature: "cool", color_tint: "blue-gray with wet reflections", intensity: "dim" },
        atmosphere: { mood: "moody", haze: "moderate", contrast: "low" },
        sky_conditions: "stormy, steady rain",
      },
    },
    {
      id: "night",
      label: "Night, lamps on",
      patch: {
        time_of_day: "night",
        shadow_intensity: "medium",
        ambient_light: { color_temperature: "warm", color_tint: "warm tungsten from the lamps", intensity: "dim" },
        atmosphere: { mood: "cozy", haze: "none", contrast: "high" },
        sky_conditions: "night",
      },
    },
  ],
  camera: [
    {
      id: "eye-level",
      label: "Eye level, straight on",
      patch: {
        camera: { height: "eye-level", angle_vertical: "level", angle_horizontal: "straight-on" },
        perspective: { type: "one-point" },
      },
    },
    {
      id: "overhead",
      label: "Overhead",
      patch: {
        camera: { height: "birds-eye", angle_vertical: "extreme-down", angle_horizontal: "straight-on" },
      },
    },
    {
      id: "low-hero",
      label: "Low hero angle",
      patch: {
        camera: { height: "low", angle_vertical: "looking-up" },
        lens: { focal_length_estimate: "wide (24-35mm)" },
      },
    },
    {
      id: "wide-corner",
      label: "Wide, 45° corner",
      patch: {
        camera: { angle_horizontal: "45-degrees", distance: "wide" },
        lens: { focal_length_estimate: "wide (24-35mm)", distortion: "slight-barrel" },
        perspective: { type: "two-point" },
      },
    },
    {
      id: "fisheye",
      label: "Fisheye",
      patch: {
        lens: { focal_length_estimate: "ultra-wide (14-24mm)", distortion: "strong-barrel", depth_of_field: "everything-sharp" },
        perspective: { type: "fisheye" },
      },
    },
    {
      id: "telephoto",
      label: "Telephoto close-up",
      patch: {
        camera: { distance: "close-up" },
        lens: { focal_length_estimate: "short-telephoto (50-85mm)", distortion: "none", depth_of_field: "shallow" },
      },
    },
  ],
};

export function presetsFor(useCase: UseCase): readonly JsonPreset[] {
  return USE_CASE_PRESETS[useCase] ?? [];
}

// ─── Apply reference ────────────────────────────────────────────────────────

/** Use cases whose reference analysis can be merged into the scene JSON. */
export function canApplyReference(useCase: UseCase): boolean {
  return useCase === "camera" || useCase === "object-swap";
}

const CAMERA_KEYS = ["camera", "lens", "perspective", "composition"] as const;

/** Scene objects a reference object could replace (object-swap), by index. */
export function swapTargets(scene: JsonObject): { index: number; name: string }[] {
  const objects = scene.objects;
  if (!Array.isArray(objects)) return [];
  return objects.map((o, index) => ({
    index,
    name: isPlainObject(o) && typeof o.name === "string" && o.name.trim() ? o.name : `Object ${index + 1}`,
  }));
}

export type ApplyReferenceResult = { ok: true; value: JsonObject } | { ok: false; error: string };

/**
 * camera: the reference's camera / lens / perspective / composition replace
 * the scene's (its own scene_description stays).
 * object-swap: the scene object at `targetIndex` takes the reference
 * object's identity and look; its position, size, orientation and overlaps
 * stay, so it lands where the old one was.
 */
export function applyReference(
  useCase: UseCase,
  scene: JsonObject,
  reference: JsonObject,
  targetIndex?: number
): ApplyReferenceResult {
  if (useCase === "camera") {
    const next: JsonObject = { ...scene };
    let copied = 0;
    for (const key of CAMERA_KEYS) {
      if (reference[key] !== undefined) {
        next[key] = reference[key];
        copied++;
      }
    }
    return copied > 0 ? { ok: true, value: next } : { ok: false, error: "The reference JSON has no camera fields." };
  }

  if (useCase === "object-swap") {
    const ref = reference.reference_object;
    if (!isPlainObject(ref)) return { ok: false, error: "The reference JSON has no reference_object." };
    const objects = scene.objects;
    if (!Array.isArray(objects) || objects.length === 0) {
      return { ok: false, error: "The scene JSON has no objects to replace." };
    }
    if (targetIndex === undefined || targetIndex < 0 || targetIndex >= objects.length) {
      return { ok: false, error: "Pick the object to replace." };
    }
    const current = isPlainObject(objects[targetIndex]) ? (objects[targetIndex] as JsonObject) : {};
    const replacement: JsonObject = { ...current };
    for (const key of ["name", "type", "color", "material"] as const) {
      if (ref[key] !== undefined) replacement[key] = ref[key];
    }
    replacement.replacement_details = {
      finish: ref.finish,
      style: ref.style,
      shape_description: ref.shape_description,
      proportions: ref.proportions,
      notable_features: ref.notable_features,
    };
    const nextObjects = [...objects];
    nextObjects[targetIndex] = replacement;
    return { ok: true, value: { ...scene, objects: nextObjects } };
  }

  return { ok: false, error: "This use case has no reference to apply." };
}
