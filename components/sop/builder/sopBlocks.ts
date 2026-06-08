import type { SopBlock, SopBlockType, SopSection } from "@/lib/sop";
import type { WkBlockType } from "@/lib/welcomeKit";
import { BLOCK_TYPES, newBlock, uid } from "@/components/welcome-kit/builder/blocks";
import { BLOCK_TYPE_LABEL, blockSummary } from "@/components/welcome-kit/builder/BlockEditor";

export { move, replaceAt, removeAt, uid } from "@/components/welcome-kit/builder/blocks";

/** Block palette for SOPs = Welcome Kit blocks + the SOP-only `steps` block. */
export const SOP_BLOCK_TYPES: { type: SopBlockType; label: string; hint: string }[] = [
  { type: "steps", label: "Steps", hint: "Numbered (or bulleted) step-by-step procedure" },
  ...BLOCK_TYPES,
];

export const SOP_BLOCK_TYPE_LABEL: Record<SopBlockType, string> = {
  ...BLOCK_TYPE_LABEL,
  steps: "Steps",
};

export function newSopBlock(type: SopBlockType): SopBlock {
  if (type === "steps") {
    return {
      id: uid("blk"),
      type: "steps",
      title: "",
      ordered: true,
      steps: [{ id: uid("step"), text: "", detail: "" }],
    };
  }
  return newBlock(type as WkBlockType);
}

export function newSopSection(index: number): SopSection {
  const n = String(index + 1).padStart(2, "0");
  return {
    id: uid("sec"),
    num: `${n} / Section`,
    icon: "file",
    title: "New Section",
    blocks: [],
  };
}

export function sopBlockSummary(block: SopBlock): string {
  if (block.type === "steps") {
    return block.title || `${block.steps.length} step${block.steps.length === 1 ? "" : "s"}`;
  }
  return blockSummary(block);
}
