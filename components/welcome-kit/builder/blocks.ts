import type { WkBlock, WkBlockType, WkSection } from "@/lib/welcomeKit";

/** Short random id for client-created sections / blocks / items. */
export function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const BLOCK_TYPES: { type: WkBlockType; label: string; hint: string }[] = [
  { type: "text", label: "Text", hint: "A paragraph (markdown supported)" },
  { type: "callout", label: "Callout", hint: "Highlighted note box (info / success / warning…)" },
  { type: "stat", label: "Stat", hint: "Big-number highlight card" },
  { type: "checklist", label: "Checklist", hint: "List with check or dot markers" },
  { type: "cards", label: "Cards", hint: "Icon cards — grid or vertical list" },
  { type: "columns", label: "Columns", hint: "Side-by-side info cards with bullets" },
  { type: "rows", label: "Rows", hint: "Label + right-aligned tag rows" },
];

export function newBlock(type: WkBlockType): WkBlock {
  switch (type) {
    case "text":
      return { id: uid("blk"), type, body: "" };
    case "callout":
      return { id: uid("blk"), type, variant: "info", icon: "info", title: "", body: "" };
    case "stat":
      return { id: uid("blk"), type, value: "", label: "", caption: "" };
    case "checklist":
      return { id: uid("blk"), type, title: "", note: "", marker: "check", items: [""] };
    case "cards":
      return {
        id: uid("blk"),
        type,
        layout: "grid",
        columns: 3,
        items: [{ id: uid("card"), icon: "star", label: "", desc: "" }],
      };
    case "columns":
      return {
        id: uid("blk"),
        type,
        items: [{ id: uid("col"), icon: "star", title: "", badge: "", body: "", bullets: [""] }],
      };
    case "rows":
      return {
        id: uid("blk"),
        type,
        title: "",
        rows: [{ id: uid("row"), label: "", value: "" }],
      };
  }
}

export function newSection(index: number): WkSection {
  const n = String(index + 1).padStart(2, "0");
  return {
    id: uid("sec"),
    num: `${n} / Section`,
    icon: "star",
    title: "New Section",
    blocks: [],
  };
}

/** Immutable array helpers used throughout the editors. */
export function move<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (target < 0 || target >= arr.length) return arr;
  const next = arr.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function replaceAt<T>(arr: T[], index: number, value: T): T[] {
  const next = arr.slice();
  next[index] = value;
  return next;
}

export function removeAt<T>(arr: T[], index: number): T[] {
  return arr.filter((_, i) => i !== index);
}
