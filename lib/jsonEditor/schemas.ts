/**
 * The JSON shape each analysis returns — sent to Claude as a structured-output
 * schema (`output_config.format`), so the analysis is always valid JSON in
 * exactly this shape, and reused by the client for the field guide.
 *
 * Structured-output rules (platform.claude.com/docs/en/build-with-claude/structured-outputs):
 * every object has `additionalProperties: false`; every property is listed in
 * `required` (a request allows only 24 optional properties in total, so the
 * schemas use none); no `anyOf` / nullable types; no numeric or length
 * constraints. Descriptions are passed through and steer the model — they
 * carry the precision rules the old free-text prompts spelled out.
 */
import type { ImageRole, UseCase } from "./useCases";

export type JsonSchema =
  | { type: "string"; description?: string }
  | { type: "array"; description?: string; items: JsonSchema }
  | {
      type: "object";
      description?: string;
      properties: Record<string, JsonSchema>;
      required: string[];
      additionalProperties: false;
    };

const str = (description: string): JsonSchema => ({ type: "string", description });
const strList = (description: string): JsonSchema => ({
  type: "array",
  description,
  items: { type: "string" },
});
/** An object whose properties are all required, in declaration order. */
function obj(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
const list = (description: string, item: JsonSchema): JsonSchema => ({ type: "array", description, items: item });

const SCENE = str("One or two sentences describing the whole scene");

const COLORS = obj({
  scene_description: SCENE,
  style: str("Overall design style, e.g. modern minimalist, rustic farmhouse"),
  objects: list(
    "Every distinct visible object — be exhaustive",
    obj({
      name: str("Descriptive, unique name of the object"),
      type: str("furniture / decor / lighting / textile / architectural / product / other"),
      position: str("Where it is in the frame, e.g. center, left foreground, back wall"),
      color: str('Precise current color, e.g. "warm cream ivory" rather than "white"'),
      material: str('Specific material, e.g. "brushed cotton velvet" rather than "fabric"'),
      finish: str("matte / glossy / satin / brushed / textured / natural"),
    })
  ),
  background: obj({
    walls: obj({ color: str("Wall color"), material: str("Wall material or finish") }),
    floor: obj({ color: str("Floor color"), material: str("Floor material") }),
    ceiling: obj({
      color: str('Ceiling color, or "not visible"'),
      material: str('Ceiling material, or "not visible"'),
    }),
  }),
  overall_palette: strList("The dominant colors of the image, most prominent first"),
});

const OBJECT_SWAP_SOURCE = obj({
  scene_description: SCENE,
  lighting: obj({
    direction: str("Where the light comes from, e.g. upper left, window on the right"),
    intensity: str("soft / medium / harsh"),
    color_temperature: str("warm / neutral / cool"),
  }),
  objects: list(
    "Every visible object with its spatial properties",
    obj({
      name: str("Descriptive, unique name of the object"),
      type: str("furniture / decor / lighting / textile / architectural / product / other"),
      position: obj({
        x: str("left / center-left / center / center-right / right"),
        y: str("foreground / mid-ground / background"),
        z: str("floor / low / mid / high / ceiling"),
      }),
      dimensions_relative: obj({
        width: str("Share of the frame width, e.g. 25%"),
        height: str("Share of the frame height, e.g. 40%"),
      }),
      color: str("Current color"),
      material: str("Current material"),
      orientation: str("Facing direction relative to the camera"),
      overlaps_with: strList("Names of the objects it overlaps, touches or sits on"),
    })
  ),
  perspective: obj({
    camera_height: str("eye-level / above / below"),
    camera_angle: str("straight-on / slight-angle / diagonal"),
  }),
});

const OBJECT_SWAP_REFERENCE = obj({
  reference_object: obj(
    {
      name: str("Descriptive name of the object"),
      type: str("furniture / decor / lighting / textile / product / other"),
      color: str("Precise color"),
      material: str("Specific material"),
      finish: str("matte / glossy / satin / brushed / textured / natural"),
      style: str("Design style, e.g. modern, classic, industrial"),
      shape_description: str("Detailed description of the shape and silhouette"),
      proportions: obj({
        width_to_height_ratio: str("Approximate ratio, e.g. 1.2:1"),
        overall_form: str("compact / elongated / wide / tall"),
      }),
      notable_features: strList("Distinctive visual features needed to recreate it faithfully"),
      orientation_in_image: str("Which direction the object faces in this photo"),
    },
    "The object in the reference image that will be placed into another scene"
  ),
});

const WEATHER = obj({
  scene_description: SCENE,
  time_of_day: str("morning / midday / afternoon / golden-hour / sunset / dusk / night"),
  sun_position: str("Where the sun or main light source appears to be"),
  shadow_direction: str("The direction shadows fall"),
  shadow_intensity: str("none / soft / medium / hard"),
  ambient_light: obj({
    color_temperature: str("warm / neutral / cool"),
    color_tint: str("Specific color cast, e.g. golden, blue-gray, pink"),
    intensity: str("dim / soft / medium / bright / harsh"),
  }),
  atmosphere: obj({
    mood: str("cozy / dramatic / serene / energetic / moody / clinical"),
    haze: str("none / slight / moderate / heavy"),
    contrast: str("low / medium / high"),
  }),
  light_sources: list(
    "Every natural and artificial light source",
    obj({
      type: str("natural / artificial"),
      name: str("window light / lamp / overhead / candle / screen / other"),
      position: str("Where it is in the scene"),
      color: str("Color of its light"),
      intensity: str("dim / soft / medium / bright"),
    })
  ),
  sky_conditions: str('clear / partly-cloudy / overcast / stormy / sunset-glow / night, or "not visible"'),
});

const CAMERA = obj({
  scene_description: SCENE,
  camera: obj({
    height: str("ground-level / low / eye-level / above-eye / overhead / birds-eye"),
    angle_vertical: str("looking-up / level / looking-down / extreme-down"),
    angle_horizontal: str("straight-on / slight-angle / 45-degrees / profile / behind"),
    distance: str("close-up / medium / wide / very-wide"),
  }),
  lens: obj({
    focal_length_estimate: str(
      "ultra-wide (14-24mm) / wide (24-35mm) / normal (35-50mm) / short-telephoto (50-85mm) / telephoto (85mm+)"
    ),
    distortion: str("strong-barrel / slight-barrel / none / slight-pincushion"),
    depth_of_field: str("shallow / moderate / deep / everything-sharp"),
  }),
  perspective: obj({
    type: str("one-point / two-point / three-point / isometric / fisheye"),
    vanishing_points: str("Where the lines converge"),
    dominant_lines: str("The major perspective lines"),
  }),
  composition: obj({
    subject_placement: str("center / rule-of-thirds-left / rule-of-thirds-right / other"),
    framing: str("tight / medium / loose / environmental"),
  }),
});

const TEXT_LOGOS = obj({
  scene_description: SCENE,
  text_elements: list(
    "Every visible piece of text",
    obj({
      content: str("The exact text, character for character"),
      position: str("Where it is, e.g. top center, bottom left"),
      font_style: str("serif / sans-serif / script / decorative / handwritten / display"),
      font_weight: str("thin / light / regular / medium / bold / black"),
      size_relative: str("small / medium / large / headline / display"),
      color: str("Text color"),
      background: str('What is behind the text, or "none"'),
      effects: str("none / shadow / outline / embossed / 3d / textured"),
      texture_material: str('What the text is made of or styled as (e.g. bread, metal, neon), or "none"'),
      case: str("uppercase / lowercase / title-case / mixed"),
      word_separation: strList("The individual words, in order"),
    })
  ),
  logos: list(
    "Every visible logo or brand mark",
    obj({
      brand_name: str('Brand name if identifiable, else "unknown"'),
      description: str("Detailed visual description of the logo"),
      position: str("Where it is in the image"),
      size_relative: str("small / medium / large"),
      colors: strList("Colors in the logo"),
      style: str("flat / 3d / embossed / metallic / other"),
      shape: str("The logo's shape and form"),
    })
  ),
  overall_style: str("The overall visual style and treatment"),
});

const SCHEMAS: Record<UseCase, Record<ImageRole, JsonSchema>> = {
  colors: { source: COLORS, reference: COLORS },
  "object-swap": { source: OBJECT_SWAP_SOURCE, reference: OBJECT_SWAP_REFERENCE },
  weather: { source: WEATHER, reference: WEATHER },
  camera: { source: CAMERA, reference: CAMERA },
  "text-logos": { source: TEXT_LOGOS, reference: TEXT_LOGOS },
};

export function analysisSchema(useCase: UseCase, role: ImageRole): JsonSchema {
  return SCHEMAS[useCase][role];
}

export interface FieldGuideEntry {
  /** Dotted path; array items as `[]`, e.g. `objects[].color`. */
  path: string;
  description: string;
}

/** Every described field of a schema, depth-first — the editor's field guide. */
export function fieldGuide(schema: JsonSchema, prefix = ""): FieldGuideEntry[] {
  const out: FieldGuideEntry[] = [];
  if (schema.type === "object") {
    for (const [key, child] of Object.entries(schema.properties)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (child.description) out.push({ path, description: child.description });
      out.push(...fieldGuide(child, path));
    }
  } else if (schema.type === "array") {
    out.push(...fieldGuide(schema.items, `${prefix}[]`));
  }
  return out;
}
