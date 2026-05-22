import { ghlRequest, getGhlConfig } from "./client";
import {
  DEFAULT_SUB_ACCOUNT_ID,
  type GhlSubAccountId,
} from "./subAccounts";
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

export async function listPipelines(
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlPipeline[]> {
  const { locationId } = getGhlConfig(subAccountId);
  return cachedSingleflight(
    `ghl:pipelines:${subAccountId}:${locationId}`,
    TTL_PIPELINES,
    async () => {
      const raw = await ghlRequest<unknown>("/opportunities/pipelines", {
        query: { locationId },
        version: VERSION,
        subAccountId,
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
    }
  );
}

/** Normalize a pipeline/stage name for tolerant matching: lowercase, drop
 *  apostrophe variants (straight + curly), collapse runs of non-alphanumeric
 *  to single spaces, trim. So "Showed didn't close" and "Showed didn’t close"
 *  both reduce to "showed didnt close". */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface ResolvedPipelineStage {
  pipelineId: string;
  pipelineName: string;
  pipelineStageId: string;
  stageName: string;
}

/**
 * Resolve a pipeline + stage by their human names to their GHL ids, tolerant
 * of case / whitespace / apostrophe differences. Returns null (and logs which
 * names were available) when either the pipeline or the stage can't be found,
 * so the CRM-sync caller no-ops loudly instead of writing to the wrong place.
 */
export async function resolvePipelineStageByName(
  pipelineName: string,
  stageName: string,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<ResolvedPipelineStage | null> {
  const pipelines = await listPipelines(subAccountId);
  const wantPipeline = normalizeName(pipelineName);
  const pipeline = pipelines.find((p) => normalizeName(p.name) === wantPipeline);
  if (!pipeline) {
    console.warn(
      `[ghl-crm] pipeline "${pipelineName}" not found (sub=${subAccountId}). Available: ${pipelines
        .map((p) => p.name)
        .join(", ") || "(none)"}`
    );
    return null;
  }

  const wantStage = normalizeName(stageName);
  const stage = pipeline.stages.find((s) => normalizeName(s.name) === wantStage);
  if (!stage) {
    console.warn(
      `[ghl-crm] stage "${stageName}" not found in pipeline "${pipeline.name}" (sub=${subAccountId}). Available: ${pipeline.stages
        .map((s) => s.name)
        .join(", ") || "(none)"}`
    );
    return null;
  }

  return {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    pipelineStageId: stage.id,
    stageName: stage.name,
  };
}

/**
 * Builds a (pipelineId|stageId)→{pipelineName, stageName} index. Cached
 * alongside `listPipelines` so callers don't repeatedly traverse stages.
 */
export async function buildStageIndex(
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<Record<string, { pipelineName: string; stageName: string }>> {
  const { locationId } = getGhlConfig(subAccountId);
  return cachedSingleflight(
    `ghl:stage-index:${subAccountId}:${locationId}`,
    TTL_PIPELINES,
    async () => {
      const pipelines = await listPipelines(subAccountId);
      const out: Record<string, { pipelineName: string; stageName: string }> = {};
      for (const p of pipelines) {
        for (const s of p.stages) {
          out[`${p.id}|${s.id}`] = { pipelineName: p.name, stageName: s.name };
        }
      }
      return out;
    }
  );
}
