import { ghlRequest, getGhlConfig, GhlApiError } from "./client";
import {
  DEFAULT_SUB_ACCOUNT_ID,
  type GhlSubAccountId,
} from "./subAccounts";
import { pickStr, cachedSingleflight } from "./util";
import type { GhlWorkflow } from "@/types/ghl";

const TTL_WORKFLOWS_LIST = 600;
const TTL_CONTACT_WORKFLOWS = 60;
const VERSION = "2023-02-21";

function normWorkflow(raw: Record<string, unknown>): GhlWorkflow {
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    name: pickStr(raw, "name") ?? "",
    status: pickStr(raw, "status"),
  };
}

/**
 * Catalog of workflows for the location. v2 path is `/workflows/` with the
 * trailing slash + version 2023-02-21 — without either, GHL returns 404.
 */
export async function listWorkflows(
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlWorkflow[]> {
  const { locationId } = getGhlConfig(subAccountId);
  return cachedSingleflight(
    `ghl:workflows:${subAccountId}:${locationId}`,
    TTL_WORKFLOWS_LIST,
    async () => {
      let raw: unknown = null;
      try {
        raw = await ghlRequest<unknown>("/workflows/", {
          query: { locationId },
          version: VERSION,
          subAccountId,
        });
      } catch (err) {
        if (err instanceof GhlApiError && (err.status === 401 || err.status === 403 || err.status === 404)) {
          return [];
        }
        throw err;
      }

      let list: unknown[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && typeof raw === "object") {
        const top = raw as Record<string, unknown>;
        if (Array.isArray(top.workflows)) list = top.workflows as unknown[];
        else if (Array.isArray(top.data)) list = top.data as unknown[];
      }

      return list
        .map((w) => normWorkflow(w as Record<string, unknown>))
        .filter((w) => w.id && w.name)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  );
}

/**
 * Workflows a single contact is currently enrolled in. Returned as a string
 * array of workflow ids; consumers resolve names from the bulk catalog.
 */
export async function getContactWorkflowIds(
  contactId: string,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<string[]> {
  return cachedSingleflight(
    `ghl:contact-workflows:${subAccountId}:${contactId}`,
    TTL_CONTACT_WORKFLOWS,
    async () => {
      const raw = await ghlRequest<unknown>(
        `/contacts/${encodeURIComponent(contactId)}/workflow`,
        { version: VERSION, subAccountId }
      );

      let list: unknown[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && typeof raw === "object") {
        const top = raw as Record<string, unknown>;
        if (Array.isArray(top.workflows)) list = top.workflows as unknown[];
        else if (Array.isArray(top.data)) list = top.data as unknown[];
      }

      return list
        .map((w) => pickStr(w, "id", "_id", "workflowId", "workflow_id") ?? "")
        .filter(Boolean);
    }
  );
}
