// Folder color palette (full class strings so Tailwind keeps them). A folder's
// color is user data picked in Folder settings, so it keeps its hue — but only
// on the folder glyph and the picker swatch; selection states stay neutral.
// Pure module: the library and its lazily-loaded dialogs both read it.

export const FOLDER_COLOR_KEYS = ["gray", "red", "amber", "green", "teal", "blue", "violet", "pink"] as const;
export type FolderColor = (typeof FOLDER_COLOR_KEYS)[number];

export const FOLDER_COLORS: Record<FolderColor, { icon: string; swatch: string }> = {
  gray: { icon: "text-muted-foreground", swatch: "bg-muted-foreground" },
  red: { icon: "text-red-500 dark:text-red-400", swatch: "bg-red-500" },
  amber: { icon: "text-amber-500 dark:text-amber-400", swatch: "bg-amber-500" },
  green: { icon: "text-green-600 dark:text-green-400", swatch: "bg-green-500" },
  teal: { icon: "text-teal-600 dark:text-teal-400", swatch: "bg-teal-500" },
  blue: { icon: "text-blue-500 dark:text-blue-400", swatch: "bg-blue-500" },
  violet: { icon: "text-violet-500 dark:text-violet-400", swatch: "bg-violet-500" },
  pink: { icon: "text-pink-500 dark:text-pink-400", swatch: "bg-pink-500" },
};

export function colorOf(c: string | undefined) {
  return FOLDER_COLORS[(c as FolderColor) in FOLDER_COLORS ? (c as FolderColor) : "gray"];
}
