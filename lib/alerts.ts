import type { Alert, AlertConfig, AlertEvaluationInput, AlertSeverity } from "@/types/alerts";
import type { InsightMetrics } from "@/types/dashboard";

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  budgetPacing: {
    enabled: true,
    severity: "warning",
    warningThresholdPct: 80,
    criticalThresholdPct: 50,
  },
  ctrDrop: {
    enabled: true,
    severity: "warning",
    dropPct: 30,
    minImpressions: 1000,
  },
  cpcSpike: {
    enabled: true,
    severity: "warning",
    spikePct: 50,
    minClicks: 50,
  },
  roasThreshold: {
    enabled: true,
    severity: "critical",
    minRoas: 1.0,
    minSpend: 50,
  },
};

/**
 * Check if campaign spend pacing is anomalous
 * (under/over-spending relative to expected linear pace)
 */
function checkBudgetPacing(
  entityId: string,
  entityName: string,
  accountId: string,
  accountName: string,
  dailyBudget: number,
  currentSpend: number,
  config: AlertConfig
): Alert | null {
  if (!config.budgetPacing.enabled || dailyBudget <= 0) return null;

  // Estimate hours into the day based on current time (UTC)
  const now = new Date();
  const hoursElapsed = now.getUTCHours() + now.getUTCMinutes() / 60;
  const dayProgress = hoursElapsed / 24;

  if (dayProgress < 0.1) return null; // Too early in the day to assess

  const expectedSpend = dailyBudget * dayProgress;
  const pacingPct = expectedSpend > 0 ? (currentSpend / expectedSpend) * 100 : 0;

  let severity: AlertSeverity | null = null;

  if (pacingPct < config.budgetPacing.criticalThresholdPct) {
    severity = "critical";
  } else if (pacingPct < config.budgetPacing.warningThresholdPct) {
    severity = "warning";
  }

  if (!severity) return null;

  return {
    id: `budget_pacing_${entityId}_${formatDateKey(now)}`,
    type: "budget_pacing",
    severity,
    entityId,
    entityName,
    entityType: "campaign",
    accountId,
    accountName,
    title: "Budget Under-Pacing",
    description: `Campaign "${entityName}" is pacing at ${pacingPct.toFixed(0)}% of expected spend. Expected $${expectedSpend.toFixed(2)}, actual $${currentSpend.toFixed(2)}.`,
    currentValue: currentSpend,
    expectedValue: expectedSpend,
    threshold: config.budgetPacing.warningThresholdPct,
    percentChange: pacingPct - 100,
    detectedAt: now.toISOString(),
  };
}

/**
 * Check for a significant CTR drop vs previous period
 */
function checkCtrDrop(
  entityId: string,
  entityName: string,
  entityType: Alert["entityType"],
  accountId: string,
  accountName: string,
  current: InsightMetrics,
  previous: InsightMetrics,
  config: AlertConfig
): Alert | null {
  if (!config.ctrDrop.enabled) return null;
  if (current.impressions < config.ctrDrop.minImpressions) return null;
  if (previous.ctr === 0) return null;

  const dropPct = ((previous.ctr - current.ctr) / previous.ctr) * 100;

  if (dropPct < config.ctrDrop.dropPct) return null;

  const now = new Date();

  return {
    id: `ctr_drop_${entityId}_${formatDateKey(now)}`,
    type: "ctr_drop",
    severity: config.ctrDrop.severity,
    entityId,
    entityName,
    entityType,
    accountId,
    accountName,
    title: "CTR Drop Detected",
    description: `CTR dropped ${dropPct.toFixed(1)}% vs previous period (${previous.ctr.toFixed(2)}% → ${current.ctr.toFixed(2)}%).`,
    currentValue: current.ctr,
    expectedValue: previous.ctr,
    threshold: config.ctrDrop.dropPct,
    percentChange: -dropPct,
    detectedAt: now.toISOString(),
  };
}

/**
 * Check for a significant CPC spike vs previous period
 */
function checkCpcSpike(
  entityId: string,
  entityName: string,
  entityType: Alert["entityType"],
  accountId: string,
  accountName: string,
  current: InsightMetrics,
  previous: InsightMetrics,
  config: AlertConfig
): Alert | null {
  if (!config.cpcSpike.enabled) return null;
  if (current.clicks < config.cpcSpike.minClicks) return null;
  if (previous.cpc === 0) return null;

  const spikePct = ((current.cpc - previous.cpc) / previous.cpc) * 100;

  if (spikePct < config.cpcSpike.spikePct) return null;

  const now = new Date();

  return {
    id: `cpc_spike_${entityId}_${formatDateKey(now)}`,
    type: "cpc_spike",
    severity: config.cpcSpike.severity,
    entityId,
    entityName,
    entityType,
    accountId,
    accountName,
    title: "CPC Spike Detected",
    description: `CPC increased ${spikePct.toFixed(1)}% vs previous period ($${previous.cpc.toFixed(2)} → $${current.cpc.toFixed(2)}).`,
    currentValue: current.cpc,
    expectedValue: previous.cpc,
    threshold: config.cpcSpike.spikePct,
    percentChange: spikePct,
    detectedAt: now.toISOString(),
  };
}

/**
 * Check if ROAS is below threshold
 */
function checkRoasThreshold(
  entityId: string,
  entityName: string,
  entityType: Alert["entityType"],
  accountId: string,
  accountName: string,
  current: InsightMetrics,
  config: AlertConfig
): Alert | null {
  if (!config.roasThreshold.enabled) return null;
  if (current.spend < config.roasThreshold.minSpend) return null;
  if (current.roas >= config.roasThreshold.minRoas) return null;

  const now = new Date();

  return {
    id: `roas_threshold_${entityId}_${formatDateKey(now)}`,
    type: "roas_below_threshold",
    severity: config.roasThreshold.severity,
    entityId,
    entityName,
    entityType,
    accountId,
    accountName,
    title: "ROAS Below Threshold",
    description: `ROAS of ${current.roas.toFixed(2)}x is below the minimum threshold of ${config.roasThreshold.minRoas}x (spend: $${current.spend.toFixed(2)}).`,
    currentValue: current.roas,
    threshold: config.roasThreshold.minRoas,
    detectedAt: now.toISOString(),
  };
}

/**
 * Evaluate all alert rules across all accounts/campaigns
 */
export function evaluateAlerts(
  input: AlertEvaluationInput,
  config: AlertConfig = DEFAULT_ALERT_CONFIG
): Alert[] {
  const alerts: Alert[] = [];
  const seen = new Set<string>();

  function addAlert(alert: Alert | null) {
    if (!alert) return;
    if (seen.has(alert.id)) return;
    seen.add(alert.id);
    alerts.push(alert);
  }

  for (const account of input.accounts) {
    // Account-level checks
    addAlert(
      checkCtrDrop(
        account.id, account.name, "account",
        account.id, account.name,
        account.currentInsights, account.previousInsights,
        config
      )
    );
    addAlert(
      checkCpcSpike(
        account.id, account.name, "account",
        account.id, account.name,
        account.currentInsights, account.previousInsights,
        config
      )
    );
    addAlert(
      checkRoasThreshold(
        account.id, account.name, "account",
        account.id, account.name,
        account.currentInsights,
        config
      )
    );

    // Campaign-level checks
    for (const campaign of account.campaigns) {
      addAlert(
        checkBudgetPacing(
          campaign.id, campaign.name,
          account.id, account.name,
          campaign.budget, campaign.currentInsights.spend,
          config
        )
      );
      addAlert(
        checkCtrDrop(
          campaign.id, campaign.name, "campaign",
          account.id, account.name,
          campaign.currentInsights, campaign.previousInsights,
          config
        )
      );
      addAlert(
        checkCpcSpike(
          campaign.id, campaign.name, "campaign",
          account.id, account.name,
          campaign.currentInsights, campaign.previousInsights,
          config
        )
      );
      addAlert(
        checkRoasThreshold(
          campaign.id, campaign.name, "campaign",
          account.id, account.name,
          campaign.currentInsights,
          config
        )
      );
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return alerts.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
