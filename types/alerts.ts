export type AlertSeverity = "critical" | "warning" | "info";

export type AlertType =
  | "budget_pacing"
  | "ctr_drop"
  | "cpc_spike"
  | "roas_below_threshold"
  | "spend_anomaly";

export interface Alert {
  id: string; // deterministic: `${type}_${entityId}_${dateKey}`
  type: AlertType;
  severity: AlertSeverity;
  entityId: string;
  entityName: string;
  entityType: "account" | "campaign" | "adset";
  accountId: string;
  accountName: string;
  title: string;
  description: string;
  currentValue: number;
  expectedValue?: number;
  threshold?: number;
  percentChange?: number;
  detectedAt: string; // ISO timestamp
}

export interface AlertRule {
  enabled: boolean;
  severity: AlertSeverity;
}

export interface BudgetPacingRule extends AlertRule {
  warningThresholdPct: number;  // e.g. 80 = warn if pacing under 80% of expected
  criticalThresholdPct: number; // e.g. 50
}

export interface CtrDropRule extends AlertRule {
  dropPct: number;              // e.g. 30 = alert if CTR drops >30%
  minImpressions: number;       // ignore if < this
}

export interface CpcSpikeRule extends AlertRule {
  spikePct: number;             // e.g. 50 = alert if CPC increases >50%
  minClicks: number;
}

export interface RoasThresholdRule extends AlertRule {
  minRoas: number;              // e.g. 1.0
  warningMinSpend: number;      // warning if spend >= this and ROAS < minRoas
  criticalMinSpend: number;     // critical if spend >= this and ROAS < minRoas
}

export interface AlertConfig {
  budgetPacing: BudgetPacingRule;
  ctrDrop: CtrDropRule;
  cpcSpike: CpcSpikeRule;
  roasThreshold: RoasThresholdRule;
}

export interface AlertEvaluationInput {
  accounts: Array<{
    id: string;
    name: string;
    currentInsights: import("@/types/dashboard").InsightMetrics;
    previousInsights: import("@/types/dashboard").InsightMetrics;
    campaigns: Array<{
      id: string;
      name: string;
      budget: number;
      budgetType: string;
      currentInsights: import("@/types/dashboard").InsightMetrics;
      previousInsights: import("@/types/dashboard").InsightMetrics;
    }>;
  }>;
  evaluatedAt: string;
}
