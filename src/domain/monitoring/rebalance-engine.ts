import {
  AllocationPlan,
  NeedsProfile,
  YieldOpportunity,
} from "../allocation/types";
import { generateAllocationPlans } from "../allocation/engine";
import { decomposeLegYield } from "@/lib/math/yield";
import { toDecimal, toPercentString } from "@/lib/math/decimal";

export interface RebalanceTriggerCheck {
  triggered: boolean;
  reason: string;
  originalMetric: string;
  currentMetric: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface RebalanceProposal {
  triggered: boolean;
  checks: RebalanceTriggerCheck[];
  primaryReason: string;
  marketDeltaSummary: string;
  originalExpectedReturnUsd: string;
  newExpectedReturnUsd: string;
  deltaReturnUsd: string;
  deltaReturnPct: string;
  proposedPlan: AllocationPlan;
}

export function detectRebalanceOpportunity(
  originalPlan: AllocationPlan,
  profile: NeedsProfile,
  currentOpportunities: YieldOpportunity[],
  effectiveLiquidUsd?: string
): RebalanceProposal {
  if (originalPlan.usdValuationStatus === "UNAVAILABLE") {
    const unavailable = "UNAVAILABLE";
    const reason = "USD valuation evidence is unavailable; dollar impact and allocation changes cannot be checked.";
    return {
      triggered: false,
      checks: [],
      primaryReason: reason,
      marketDeltaSummary: reason,
      originalExpectedReturnUsd: unavailable,
      newExpectedReturnUsd: unavailable,
      deltaReturnUsd: unavailable,
      deltaReturnPct: unavailable,
      proposedPlan: originalPlan,
    };
  }

  const checks: RebalanceTriggerCheck[] = [];
  let shouldTrigger = false;

  // Calculate degraded yield of current holdings under new market conditions
  let simulatedCurrentNetYield = toDecimal(0);
  let simulatedNetYieldAvailable = true;

  // 1. Check APY drop on allocated products
  for (const leg of originalPlan.allocations) {
    const currentOpp = currentOpportunities.find((o) => o.id === leg.productId);
    if (!currentOpp) {
      if (leg.netYieldEstimateUsd === null) {
        simulatedNetYieldAvailable = false;
      } else {
        simulatedCurrentNetYield = simulatedCurrentNetYield.plus(toDecimal(leg.netYieldEstimateUsd));
      }
      continue;
    }

    const decomp = decomposeLegYield(
      leg.usdValue,
      currentOpp.baseApy,
      currentOpp.incentiveApy,
      originalPlan.horizonDays,
      currentOpp.estimatedEntryCostUsd,
      currentOpp.estimatedExitCostUsd
    );
    if (decomp.netYieldUsd === null) {
      simulatedNetYieldAvailable = false;
    } else {
      simulatedCurrentNetYield = simulatedCurrentNetYield.plus(toDecimal(decomp.netYieldUsd));
    }

    const originalApy = toDecimal(leg.totalApy ?? leg.baseApy);
    const currentApy = toDecimal(currentOpp.totalApy ?? currentOpp.baseApy);

    if (currentApy.lt(originalApy)) {
      shouldTrigger = true;
      checks.push({
        triggered: true,
        reason: `${leg.productName} recorded yield assumption is below its original value.`,
        originalMetric: toPercentString(originalApy.toString()),
        currentMetric: toPercentString(currentApy.toString()),
        severity: currentApy.lte(0) ? "HIGH" : "MEDIUM",
      });
    }
  }

  // 2. Check Liquidity Shortfall (if effective balance changed)
  const requiredLiquid = toDecimal(profile.minimumLiquidUsd);
  const currentLiquid = effectiveLiquidUsd
    ? toDecimal(effectiveLiquidUsd)
    : toDecimal(originalPlan.liquidReserveUsd);

  if (currentLiquid.lt(requiredLiquid)) {
    shouldTrigger = true;
    checks.push({
      triggered: true,
      reason: "가용 비상금이 필수 안전 유동성 기준선 미만으로 하락 (minimum required reserve breach)",
      originalMetric: `$${requiredLiquid.toFixed(2)} (필수)`,
      currentMetric: `$${currentLiquid.toFixed(2)} (현재)`,
      severity: "HIGH",
    });
  }

  // Generate proposed new plan reflecting the new market condition
  const { plans } = generateAllocationPlans(profile, currentOpportunities);
  // Pick matching strategy plan
  const proposedPlan =
    plans.find((p) => p.strategyType === originalPlan.strategyType) || plans[0];

  const primaryReason = checks.length > 0
    ? checks[0].reason
    : "리밸런싱 불필요: 현재 포지션이 목표 수익률 및 안전 조건을 충실히 유지하고 있습니다.";

  const marketDeltaSummary = checks
    .map((c) => `${c.reason} (${c.originalMetric} -> ${c.currentMetric})`)
    .join("; ");

  const origReturn = originalPlan.expectedNetYieldUsd === null
    ? null
    : toDecimal(originalPlan.expectedNetYieldUsd);
  const newReturn = simulatedNetYieldAvailable ? simulatedCurrentNetYield : null;
  const deltaReturn = origReturn !== null && newReturn !== null
    ? newReturn.minus(origReturn)
    : null;
  // Use the magnitude as the denominator so a yield decline remains negative
  // even when Compass policy cost estimates make the original net return < 0.
  const deltaPct = origReturn !== null && deltaReturn !== null && !origReturn.isZero()
    ? deltaReturn.div(origReturn.abs()).times(100).toFixed(1)
    : "0.0";

  return {
    triggered: shouldTrigger,
    checks,
    primaryReason,
    marketDeltaSummary: marketDeltaSummary || "시장 환경이 안정적인 허용 오차 내에서 유지 중입니다.",
    originalExpectedReturnUsd: origReturn?.toFixed(2) ?? "UNAVAILABLE",
    newExpectedReturnUsd: newReturn?.toFixed(2) ?? "UNAVAILABLE",
    deltaReturnUsd: deltaReturn?.toFixed(2) ?? "UNAVAILABLE",
    deltaReturnPct: deltaReturn === null ? "UNAVAILABLE" : `${deltaReturn.gte(0) ? "+" : ""}${deltaPct}%`,
    proposedPlan,
  };
}
