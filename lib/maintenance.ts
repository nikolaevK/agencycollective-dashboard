import { getAgencyConfig, updateAgencyConfig } from "@/lib/agencyConfig";

/**
 * Client-portal maintenance mode. A global notify-only flag (the portal stays
 * fully usable) controlled by admins from the Client Directory. Persisted as
 * two rows in the existing `agency_config` key/value table — no schema change.
 */

export const MAINTENANCE_ENABLED_KEY = "maintenance_enabled";
export const MAINTENANCE_MESSAGE_KEY = "maintenance_message";
export const MAINTENANCE_MESSAGE_MAX = 500;

export const DEFAULT_MAINTENANCE_MESSAGE =
  "We're performing scheduled maintenance on the portal. Some features may be temporarily unavailable — thank you for your patience.";

export interface MaintenanceConfig {
  enabled: boolean;
  /** RAW stored message (may be empty — callers apply the default for display). */
  message: string;
}

/** The message clients actually see: the custom text, or the built-in default. */
export function effectiveMaintenanceMessage(cfg: MaintenanceConfig): string {
  return cfg.message.trim() || DEFAULT_MAINTENANCE_MESSAGE;
}

export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  const [enabledRaw, messageRaw] = await Promise.all([
    getAgencyConfig(MAINTENANCE_ENABLED_KEY),
    getAgencyConfig(MAINTENANCE_MESSAGE_KEY),
  ]);
  return {
    enabled: enabledRaw === "1",
    message: messageRaw ?? "",
  };
}

export async function setMaintenanceConfig(input: {
  enabled: boolean;
  message?: string;
}): Promise<MaintenanceConfig> {
  await updateAgencyConfig(MAINTENANCE_ENABLED_KEY, input.enabled ? "1" : "0");
  if (input.message !== undefined) {
    const msg = String(input.message).slice(0, MAINTENANCE_MESSAGE_MAX);
    await updateAgencyConfig(MAINTENANCE_MESSAGE_KEY, msg);
  }
  return getMaintenanceConfig();
}
