import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";

export type UsddHealthGrade = "HEALTHY" | "CAUTION" | "CRITICAL" | "STALE_FALLBACK";

export interface UsddDecisionSignal {
  grade: UsddHealthGrade;
  riskClass: UsddHealthGrade;
  collateralRatioPct: number | null;
  thresholdProvenance: "COMPASS_POLICY";
  priceRiskClass: "LOW" | "MEDIUM" | "HIGH";
  eligibleForConservativePlan: boolean;
  eligibleForYieldPlan: boolean;
  scoreBonus: number;
  reason: string;
  warningNotice?: string;
  isStaleOrFallback: boolean;
  isFallback: boolean;
}

export const USDD_POLICY_THRESHOLDS = {
  healthy: 130,
  critical: 110,
} as const;

/** These are TRON Compass policy thresholds, not official USDD risk categories. */
export function evaluateUsddDecisionSignal(
  evidence?: UsddProtocolEvidence | null
): UsddDecisionSignal {
  if (!evidence) {
    return {
      grade: "CAUTION",
      riskClass: "CAUTION",
      collateralRatioPct: null,
      thresholdProvenance: "COMPASS_POLICY",
      priceRiskClass: "LOW",
      eligibleForConservativePlan: false,
      eligibleForYieldPlan: false,
      scoreBonus: -10,
      reason: "USDD collateral evidence is unavailable; new USDD allocation is excluded.",
      warningNotice: "USDD condition UNKNOWN: no collateral evidence is available.",
      isStaleOrFallback: true,
      isFallback: true,
    };
  }

  const rawRatio = evidence.collateralRatioPct?.replace("%", "").trim() || "";
  const parsedRatio = Number.parseFloat(rawRatio);
  const ratio = Number.isFinite(parsedRatio) ? parsedRatio : null;
  const isFallback = evidence.source === "fallback" || evidence.reality === "SNAPSHOT";

  if (ratio === null) {
    return {
      grade: "CAUTION",
      riskClass: "CAUTION",
      collateralRatioPct: null,
      thresholdProvenance: "COMPASS_POLICY",
      priceRiskClass: "LOW",
      eligibleForConservativePlan: false,
      eligibleForYieldPlan: false,
      scoreBonus: -10,
      reason: "USDD collateral ratio is unavailable; new USDD allocation is excluded.",
      warningNotice: "USDD condition UNKNOWN: no numeric collateral ratio is available.",
      isStaleOrFallback: true,
      isFallback: true,
    };
  }

  if (isFallback) {
    return {
      grade: "CAUTION",
      riskClass: "CAUTION",
      collateralRatioPct: ratio,
      thresholdProvenance: "COMPASS_POLICY",
      priceRiskClass: "LOW",
      eligibleForConservativePlan: false,
      eligibleForYieldPlan: false,
      scoreBonus: -10,
      reason: `USDD ratio ${ratio.toFixed(1)}% is a stored snapshot; Compass policy excludes new allocation until live evidence returns.`,
      warningNotice: "USDD SNAPSHOT evidence is stale for allocation decisions.",
      isStaleOrFallback: true,
      isFallback: true,
    };
  }

  if (ratio >= USDD_POLICY_THRESHOLDS.healthy) {
    return {
      grade: "HEALTHY",
      riskClass: "HEALTHY",
      collateralRatioPct: ratio,
      thresholdProvenance: "COMPASS_POLICY",
      priceRiskClass: "LOW",
      eligibleForConservativePlan: true,
      eligibleForYieldPlan: true,
      scoreBonus: 5,
      reason: `USDD ratio ${ratio.toFixed(1)}% meets the TRON Compass policy threshold (${USDD_POLICY_THRESHOLDS.healthy}%).`,
      isStaleOrFallback: false,
      isFallback: false,
    };
  }

  if (ratio >= USDD_POLICY_THRESHOLDS.critical) {
    return {
      grade: "CAUTION",
      riskClass: "CAUTION",
      collateralRatioPct: ratio,
      thresholdProvenance: "COMPASS_POLICY",
      priceRiskClass: "LOW",
      eligibleForConservativePlan: false,
      eligibleForYieldPlan: true,
      scoreBonus: -10,
      reason: `USDD ratio ${ratio.toFixed(1)}% is below the TRON Compass policy threshold (${USDD_POLICY_THRESHOLDS.healthy}%).`,
      warningNotice: "Compass policy excludes USDD from Plan A in this range.",
      isStaleOrFallback: false,
      isFallback: false,
    };
  }

  return {
    grade: "CRITICAL",
    riskClass: "CRITICAL",
    collateralRatioPct: ratio,
    thresholdProvenance: "COMPASS_POLICY",
    priceRiskClass: "LOW",
    eligibleForConservativePlan: false,
    eligibleForYieldPlan: false,
    scoreBonus: -25,
    reason: `USDD ratio ${ratio.toFixed(1)}% is below the TRON Compass policy floor (${USDD_POLICY_THRESHOLDS.critical}%).`,
    warningNotice: "Compass policy excludes new USDD allocation in this range.",
    isStaleOrFallback: false,
    isFallback: false,
  };
}
