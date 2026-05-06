import { ghlRequest, getGhlConfig } from "./client";
import { pickStr, pickNum, cachedSingleflight } from "./util";
import type { GhlPipeline, GhlPipelineStage } from "@/types/ghl";

const TTL_PIPELINES = 600;
const VERSION = "2023-02-21";

function normStage(raw: Record<string, unknown>): GhlPipelineStage {
  const position = pickNum(raw, "position");
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    name: pickStr(raw, "name") ?? "",
    position: position ?? undefined,
  };
}

function normPipeline(raw: Record<string, unknown>): GhlPipeline {
  const stages = Array.isArray(raw.stages)
    ? (raw.stages as Record<string, unknown>[]).map(normStage).filter((s) => s.id)
    : [];
  stages.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    name: pickStr(raw, "name") ?? "",
    stages,
  };
}

export async function listPipelines(): Promise<GhlPipeline[]> {
  const { locationId } = getGhlConfig();
  return cachedSingleflight(`ghl:pipelines:${locationId}`, TTL_PIPELINES, async () => {
    const raw = await ghlRequest<unknown>("/opportunities/pipelines", {
      query: { locationId },
      version: VERSION,
    });
    let list: unknown[] = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === "object") {
      const top = raw as Record<string, unknown>;
      if (Array.isArray(top.pipelines)) list = top.pipelines as unknown[];
      else if (Array.isArray(top.data)) list = top.data as unknown[];
    }

    return list
      .map((p) => normPipeline(p as Record<string, unknown>))
      .filter((p) => p.id);
  });
}

/**
 * Builds a (pipelineId|stageId)→{pipelineName, stageName} index. Cached
 * alongside `listPipelines` so callers don't repeatedly traverse stages.
 */
export async function buildStageIndex(): Promise<
  Record<string, { pipelineName: string; stageName: string }>
> {
  const { locationId } = getGhlConfig();
  return cachedSingleflight(`ghl:stage-index:${locationId}`, TTL_PIPELINES, async () => {
    const pipelines = await listPipelines();
    const out: Record<string, { pipelineName: string; stageName: string }> = {};
    for (const p of pipelines) {
      for (const s of p.stages) {
        out[`${p.id}|${s.id}`] = { pipelineName: p.name, stageName: s.name };
      }
    }
    return out;
  });
}
