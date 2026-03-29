// ─── Use-case types ────────────────────────────────────────────────────────
export type UseCase = "colors" | "object-swap" | "weather" | "camera" | "text-logos";
export type ImageRole = "source" | "reference";

export const ALLOWED_USE_CASES: readonly UseCase[] = [
  "colors",
  "object-swap",
  "weather",
  "camera",
  "text-logos",
];

// ─── Claude analysis prompts (image → JSON) ───────────────────────────────

const COLORS_ANALYSIS = `You are an expert image analyst specializing in interior design and object recognition.

Analyze the provided image and return a JSON object describing every visible object with precise color and material details.

Return ONLY valid JSON — no explanation, no markdown fences, no commentary. Use this exact structure:

{
  "scene_description": "Brief description of the overall scene",
  "style": "Overall design style (e.g. modern minimalist, rustic farmhouse)",
  "objects": [
    {
      "name": "descriptive name of the object",
      "type": "furniture/decor/lighting/textile/architectural",
      "position": "where in the image (e.g. center, left foreground, back wall)",
      "color": "precise current color (e.g. warm cream ivory, not just white)",
      "material": "specific material (e.g. brushed cotton velvet, not just fabric)",
      "finish": "matte/glossy/satin/brushed/textured/natural"
    }
  ],
  "background": {
    "walls": { "color": "wall color", "material": "wall material" },
    "floor": { "color": "floor color", "material": "floor material" },
    "ceiling": { "color": "ceiling color", "material": "ceiling material" }
  },
  "overall_palette": ["list", "of", "dominant", "colors"]
}

Be exhaustive — list every distinct object visible in the scene. Be precise about colors (e.g. "warm cream ivory" not just "white") and materials (e.g. "brushed cotton velvet" not just "fabric").`;

const OBJECT_SWAP_SOURCE_ANALYSIS = `You are an expert image analyst specializing in spatial analysis and object recognition.

Analyze the provided image and return a JSON object describing all visible objects with their spatial properties, proportions, and relationships to each other.

Return ONLY valid JSON — no explanation, no markdown fences. Use this exact structure:

{
  "scene_description": "Brief description of the overall scene",
  "lighting": {
    "direction": "where light comes from (e.g. upper left, window right)",
    "intensity": "soft/medium/harsh",
    "color_temperature": "warm/neutral/cool"
  },
  "objects": [
    {
      "name": "descriptive name",
      "type": "furniture/decor/lighting/textile/architectural",
      "position": {
        "x": "left/center-left/center/center-right/right",
        "y": "foreground/mid-ground/background",
        "z": "floor/low/mid/high/ceiling"
      },
      "dimensions_relative": {
        "width": "percentage of frame width (e.g. 25%)",
        "height": "percentage of frame height (e.g. 40%)"
      },
      "color": "current color",
      "material": "current material",
      "orientation": "facing direction relative to camera",
      "overlaps_with": ["names of objects it overlaps or touches"]
    }
  ],
  "perspective": {
    "camera_height": "eye-level/above/below",
    "camera_angle": "straight-on/slight-angle/diagonal"
  }
}

Be precise about spatial relationships. Note which objects overlap, touch, or are adjacent.`;

const OBJECT_SWAP_REFERENCE_ANALYSIS = `You are an expert image analyst. Analyze the provided reference object image and describe its visual properties in detail.

Return ONLY valid JSON — no explanation, no markdown fences. Use this exact structure:

{
  "reference_object": {
    "name": "descriptive name of the object",
    "type": "furniture/decor/lighting/textile",
    "color": "precise color",
    "material": "specific material",
    "finish": "matte/glossy/satin/etc",
    "style": "design style (modern/classic/industrial/etc)",
    "shape_description": "detailed shape description",
    "proportions": {
      "width_to_height_ratio": "approximate ratio (e.g. 1.2:1)",
      "overall_form": "compact/elongated/wide/tall"
    },
    "notable_features": ["list of distinctive visual features"],
    "orientation_in_image": "which direction the object faces"
  }
}

Be very precise about shape, proportions, and distinctive features — these will be used to accurately recreate this object in a different scene.`;

const WEATHER_ANALYSIS = `You are an expert image analyst specializing in lighting and atmospheric conditions.

Analyze the provided image and return a JSON object describing the current lighting, weather mood, and atmospheric properties. Focus ONLY on light and atmosphere — do not describe individual furniture or objects.

Return ONLY valid JSON — no explanation, no markdown fences. Use this exact structure:

{
  "scene_description": "Brief description of the scene",
  "time_of_day": "morning/midday/afternoon/golden-hour/sunset/dusk/night",
  "sun_position": "where the sun/main light source appears to be",
  "shadow_direction": "direction shadows fall",
  "shadow_intensity": "none/soft/medium/hard",
  "ambient_light": {
    "color_temperature": "warm/neutral/cool",
    "color_tint": "specific color cast (e.g. golden, blue-gray, pink)",
    "intensity": "dim/soft/medium/bright/harsh"
  },
  "atmosphere": {
    "mood": "cozy/dramatic/serene/energetic/moody/clinical",
    "haze": "none/slight/moderate/heavy",
    "contrast": "low/medium/high"
  },
  "light_sources": [
    {
      "type": "natural/artificial",
      "name": "window light/lamp/overhead/candle/etc",
      "position": "where in the scene",
      "color": "light color",
      "intensity": "dim/soft/medium/bright"
    }
  ],
  "sky_conditions": "clear/partly-cloudy/overcast/stormy/sunset-glow/night (if visible)"
}

Focus on capturing the exact lighting mood so it can be precisely modified.`;

const CAMERA_ANALYSIS = `You are an expert cinematographer and photographer. Analyze the camera perspective and lens properties of the provided image.

Return ONLY valid JSON — no explanation, no markdown fences. Use this exact structure:

{
  "scene_description": "Brief description of what is shown",
  "camera": {
    "height": "ground-level/low/eye-level/above-eye/overhead/birds-eye",
    "angle_vertical": "looking-up/level/looking-down/extreme-down",
    "angle_horizontal": "straight-on/slight-angle/45-degrees/profile/behind",
    "distance": "close-up/medium/wide/very-wide"
  },
  "lens": {
    "focal_length_estimate": "ultra-wide (14-24mm)/wide (24-35mm)/normal (35-50mm)/short-telephoto (50-85mm)/telephoto (85mm+)",
    "distortion": "strong-barrel/slight-barrel/none/slight-pincushion",
    "depth_of_field": "shallow/moderate/deep/everything-sharp"
  },
  "perspective": {
    "type": "one-point/two-point/three-point/isometric/fisheye",
    "vanishing_points": "description of where lines converge",
    "dominant_lines": "description of major perspective lines"
  },
  "composition": {
    "subject_placement": "center/rule-of-thirds-left/rule-of-thirds-right/etc",
    "framing": "tight/medium/loose/environmental"
  }
}

Focus purely on camera and lens properties — ignore object details.`;

const TEXT_LOGOS_ANALYSIS = `You are an expert image analyst specializing in typography and brand identity.

Analyze the provided image and return a JSON object describing all visible text elements and logos with precise details about their appearance.

Return ONLY valid JSON — no explanation, no markdown fences. Use this exact structure:

{
  "scene_description": "Brief description of the overall image",
  "text_elements": [
    {
      "content": "exact text content",
      "position": "where in the image (e.g. top center, bottom left)",
      "font_style": "serif/sans-serif/script/decorative/handwritten/display",
      "font_weight": "thin/light/regular/medium/bold/black",
      "size_relative": "small/medium/large/headline/display",
      "color": "text color",
      "background": "background behind text if any",
      "effects": "none/shadow/outline/embossed/3d/textured",
      "texture_material": "if text is made of or styled as a material (e.g. bread, metal, neon)",
      "case": "uppercase/lowercase/title-case/mixed",
      "word_separation": ["individual", "words", "listed", "separately"]
    }
  ],
  "logos": [
    {
      "brand_name": "brand name if identifiable",
      "description": "detailed visual description of the logo",
      "position": "where in the image",
      "size_relative": "small/medium/large",
      "colors": ["list of colors in the logo"],
      "style": "flat/3d/embossed/metallic/etc",
      "shape": "description of logo shape/form"
    }
  ],
  "overall_style": "description of the overall visual style and treatment"
}

Be precise about text content, font characteristics, and any special material/texture treatments.`;

const ANALYSIS_PROMPTS: Record<UseCase, Record<ImageRole, string>> = {
  colors: { source: COLORS_ANALYSIS, reference: COLORS_ANALYSIS },
  "object-swap": { source: OBJECT_SWAP_SOURCE_ANALYSIS, reference: OBJECT_SWAP_REFERENCE_ANALYSIS },
  weather: { source: WEATHER_ANALYSIS, reference: WEATHER_ANALYSIS },
  camera: { source: CAMERA_ANALYSIS, reference: CAMERA_ANALYSIS },
  "text-logos": { source: TEXT_LOGOS_ANALYSIS, reference: TEXT_LOGOS_ANALYSIS },
};

export function getAnalysisPrompt(useCase: UseCase, imageRole: ImageRole): string {
  return ANALYSIS_PROMPTS[useCase][imageRole];
}

// ─── Gemini generation prompts (JSON + image → modified image) ─────────────

const USE_CASE_INSTRUCTIONS: Record<UseCase, string> = {
  colors: `CRITICAL RULES:
- Change ONLY the specified colors and materials. Nothing else.
- Maintain all object shapes, positions, proportions, and perspectives exactly as they are.
- Preserve the exact same lighting, shadows, and reflections — only update them to reflect the new colors/materials.
- Keep every other object in the scene completely untouched.
- The generated image should be indistinguishable from the original except for the changed properties.`,

  "object-swap": `CRITICAL RULES:
- Replace ONLY the specified object with the reference object shown in the second image.
- Match the scale, perspective, and orientation to fit naturally in the original scene.
- Maintain correct lighting and shadows from the original scene on the new object.
- Keep ALL other objects in the scene completely untouched.
- Ensure the replaced object sits naturally in its position — correct shadows, reflections, and overlaps with neighboring objects.
- If a pillow, throw, or other item was on the original object, place it naturally on the replacement.`,

  weather: `CRITICAL RULES:
- Change ONLY the lighting and atmospheric conditions as specified.
- Keep ALL objects, furniture, positions, and compositions completely identical.
- Do NOT add, remove, or modify any physical objects in the scene.
- Do NOT remove curtains, blinds, or window coverings to "show" the weather.
- Apply the new lighting mood through color temperature, shadow direction/intensity, and ambient light changes.
- If changing to a darker time of day, artificial light sources in the scene should appear to emit light.`,

  camera: `CRITICAL RULES:
- Apply the specified camera perspective to the scene.
- Maintain the same room, objects, and overall composition.
- The camera angle, focal length, and perspective type should match the specified properties.
- Where the new perspective reveals areas not visible in the original, fill them naturally and consistently with the existing scene style.
- Maintain consistent lighting and materials across the entire generated image.`,

  "text-logos": `CRITICAL RULES:
- Change ONLY the specified text content or logos. Nothing else.
- Maintain the exact same font style, size, weight, color, and effects.
- If the text is made of a material (bread, metal, neon, etc.), maintain that exact same material/texture.
- Preserve exact positioning and any background elements.
- For logos, match the placement, size, and style treatment (embossing, metallic, etc.) of the original.
- Keep ALL other visual elements completely untouched.`,
};

export function getGenerationPrompt(
  useCase: UseCase,
  originalJson: string,
  modifiedJson: string,
  changes: string[],
): string {
  const instructions = USE_CASE_INSTRUCTIONS[useCase];

  return `Modify this image based on the following JSON specification.

ORIGINAL JSON (describes the current image):
${originalJson}

MODIFIED JSON (describes the desired result):
${modifiedJson}

SPECIFIC CHANGES TO APPLY:
${changes.map((c) => `- ${c}`).join("\n")}

${instructions}

Generate the modified image now.`;
}

// ─── JSON diff helper ──────────────────────────────────────────────────────

const MAX_DIFF_ENTRIES = 200;
const MAX_DIFF_DEPTH = 20;

export function computeJsonDiff(
  original: Record<string, unknown>,
  modified: Record<string, unknown>,
  path = "",
  depth = 0,
): string[] {
  const changes: string[] = [];
  if (depth > MAX_DIFF_DEPTH) return changes;

  const allKeys = new Set([...Object.keys(original), ...Object.keys(modified)]);

  for (const key of allKeys) {
    if (changes.length >= MAX_DIFF_ENTRIES) break;

    const currentPath = path ? `${path}.${key}` : key;
    const origVal = original[key];
    const modVal = modified[key];

    if (origVal === modVal) continue;

    if (origVal === undefined) {
      changes.push(`Added ${currentPath}: ${JSON.stringify(modVal)?.slice(0, 200)}`);
    } else if (modVal === undefined) {
      changes.push(`Removed ${currentPath}`);
    } else if (
      typeof origVal === "object" &&
      origVal !== null &&
      typeof modVal === "object" &&
      modVal !== null &&
      !Array.isArray(origVal) &&
      !Array.isArray(modVal)
    ) {
      changes.push(
        ...computeJsonDiff(
          origVal as Record<string, unknown>,
          modVal as Record<string, unknown>,
          currentPath,
          depth + 1,
        ),
      );
    } else if (Array.isArray(origVal) && Array.isArray(modVal)) {
      const maxLen = Math.max(origVal.length, modVal.length);
      for (let i = 0; i < maxLen && changes.length < MAX_DIFF_ENTRIES; i++) {
        if (i >= origVal.length) {
          changes.push(`Added ${currentPath}[${i}]`);
        } else if (i >= modVal.length) {
          changes.push(`Removed ${currentPath}[${i}]`);
        } else if (
          typeof origVal[i] === "object" &&
          origVal[i] !== null &&
          typeof modVal[i] === "object" &&
          modVal[i] !== null
        ) {
          changes.push(
            ...computeJsonDiff(
              origVal[i] as Record<string, unknown>,
              modVal[i] as Record<string, unknown>,
              `${currentPath}[${i}]`,
              depth + 1,
            ),
          );
        } else if (JSON.stringify(origVal[i]) !== JSON.stringify(modVal[i])) {
          changes.push(
            `Changed ${currentPath}[${i}]: ${JSON.stringify(origVal[i])?.slice(0, 100)} → ${JSON.stringify(modVal[i])?.slice(0, 100)}`,
          );
        }
      }
    } else {
      changes.push(
        `Changed ${currentPath}: ${JSON.stringify(origVal)?.slice(0, 100)} → ${JSON.stringify(modVal)?.slice(0, 100)}`,
      );
    }
  }

  return changes;
}
