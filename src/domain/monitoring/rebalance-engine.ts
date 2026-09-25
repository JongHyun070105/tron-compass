import {
  AllocationPlan,
  NeedsProfile,
  YieldOpportunity,
} from "../allocation/types";
import { generateAllocationPlans } from "../allocation/engine";
import { decomposeLegYield } from "@/lib/math/yield";
import { SafeMath, toDecimal, toPercentString } from "@/lib/math/decimal";

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
  const checks: RebalanceTriggerCheck[] = [];
  let shouldTrigger = false;

  // Calculate degraded yield of current holdings under new market conditions
  let simulatedCurrentNetYield = toDecimal(0);

  // 1. Check APY drop on allocated products
  for (const leg of originalPlan.allocations) {
    const currentOpp = currentOpportunities.find((o) => o.id === leg.productId);
    if (!currentOpp) {
      simulatedCurrentNetYield = simulatedCurrentNetYield.plus(toDecimal(leg.netYieldEstimateUsd));
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
    simulatedCurrentNetYield = simulatedCurrentNetYield.plus(toDecimal(decomp.netYieldUsd));

    const originalApy = toDecimal(leg.totalApy);
    const currentApy = toDecimal(currentOpp.totalApy);

    // If APY dropped by more than 30% or by at least 1.5% absolute
    const droppedAbs = originalApy.minus(currentApy);
    const droppedPct = originalApy.gt(0)
      ? droppedAbs.div(originalApy)
      : toDecimal(0);

    if (droppedPct.gte(0.30) || droppedAbs.gte(0.015)) {
      shouldTrigger = true;
      checks.push({
        triggered: true,
        reason: `${leg.productName} 채굴 인센티브 또는 수익률 급감 (APY significantly decayed)`,
        originalMetric: toPercentString(originalApy.toString()),
        currentMetric: toPercentString(currentApy.toString()),
        severity: "HIGH",
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

  const origReturn = toDecimal(originalPlan.expectedNetYieldUsd);
  const newReturn = simulatedCurrentNetYield;
  const deltaReturn = newReturn.minus(origReturn);
  const deltaPct = origReturn.gt(0)
    ? deltaReturn.div(origReturn).times(100).toFixed(1)
    : "0.0";

  return {
    triggered: shouldTrigger,
    checks,
    primaryReason,
    marketDeltaSummary: marketDeltaSummary || "시장 환경이 안정적인 허용 오차 내에서 유지 중입니다.",
    originalExpectedReturnUsd: origReturn.toFixed(2),
    newExpectedReturnUsd: newReturn.toFixed(2),
    deltaReturnUsd: deltaReturn.toFixed(2),
    deltaReturnPct: `${deltaReturn.gte(0) ? "+" : ""}${deltaPct}%`,
    proposedPlan,
  };
}
