import {
  AllocationPlan,
  NeedsProfile,
  YieldOpportunity,
} from "../allocation/types";
import { generateAllocationPlans } from "../allocation/engine";
import { decomposeLegYield } from "@/lib/math/yield";
import { toDecimal } from "@/lib/math/decimal";

export interface RebalanceTriggerCheck {
  triggered: boolean;
  reason: string;
  originalMetric: string;
  currentMetric: string;
  metricLabel?: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

function formatPercentTransition(before: string, after: string): [string, string] {
  const beforePct = toDecimal(before).times(100);
  const afterPct = toDecimal(after).times(100);
  let precision = 2;
  while (precision < 10 && beforePct.toFixed(precision) === afterPct.toFixed(precision)) {
    precision += 1;
  }
  return [`${beforePct.toFixed(precision)}%`, `${afterPct.toFixed(precision)}%`];
}

export interface RebalanceProposal {
  triggered: boolean;
  checks: RebalanceTriggerCheck[];
  primaryReason: string;
  marketDeltaSummary: string;
  originalExpectedReturnUsdtEquivalent: string;
  newExpectedReturnUsdtEquivalent: string;
  deltaReturnUsdtEquivalent: string;
  deltaReturnPct: string;
  proposedPlan: AllocationPlan;
}

export function detectRebalanceOpportunity(
  originalPlan: AllocationPlan,
  profile: NeedsProfile,
  currentOpportunities: YieldOpportunity[],
  effectiveLiquidUsdtEquivalent?: string
): RebalanceProposal {
  if (originalPlan.valuationStatus === "UNAVAILABLE") {
    const unavailable = "UNAVAILABLE";
    const reason = "Live USDT-equivalent valuation evidence is unavailable; impact and allocation changes cannot be checked.";
    return {
      triggered: false,
      checks: [],
      primaryReason: reason,
      marketDeltaSummary: reason,
      originalExpectedReturnUsdtEquivalent: unavailable,
      newExpectedReturnUsdtEquivalent: unavailable,
      deltaReturnUsdtEquivalent: unavailable,
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
      if (leg.netYieldEstimateUsdtEquivalent === null) {
        simulatedNetYieldAvailable = false;
      } else {
        simulatedCurrentNetYield = simulatedCurrentNetYield.plus(toDecimal(leg.netYieldEstimateUsdtEquivalent));
      }
      continue;
    }

    const decomp = decomposeLegYield(
      leg.valueUsdtEquivalent,
      currentOpp.baseApy,
      currentOpp.incentiveApy,
      originalPlan.horizonDays,
      currentOpp.estimatedEntryCostUsdtEquivalent,
      currentOpp.estimatedExitCostUsdtEquivalent
    );
    if (decomp.netYieldUsdtEquivalent === null) {
      simulatedNetYieldAvailable = false;
    } else {
      simulatedCurrentNetYield = simulatedCurrentNetYield.plus(toDecimal(decomp.netYieldUsdtEquivalent));
    }

    const originalApy = toDecimal(leg.totalApy ?? leg.baseApy);
    const currentApy = toDecimal(currentOpp.totalApy ?? currentOpp.baseApy);

    if (currentApy.lt(originalApy)) {
      shouldTrigger = true;
      const [originalBaseApy, currentBaseApy] = formatPercentTransition(leg.baseApy, currentOpp.baseApy);
      checks.push({
        triggered: true,
        reason: `${leg.productName} recorded yield assumption is below its original value.`,
        originalMetric: originalBaseApy,
        currentMetric: currentBaseApy,
        metricLabel: "Base APY",
        severity: currentApy.lte(0) ? "HIGH" : "MEDIUM",
      });
    }
  }

  // 2. Check Liquidity Shortfall (if effective balance changed)
  const requiredLiquid = toDecimal(profile.minimumLiquidUsdtEquivalent);
  const currentLiquid = effectiveLiquidUsdtEquivalent
    ? toDecimal(effectiveLiquidUsdtEquivalent)
    : toDecimal(originalPlan.liquidReserveUsdtEquivalent);

  if (currentLiquid.lt(requiredLiquid)) {
    shouldTrigger = true;
    checks.push({
      triggered: true,
      reason: "가용 비상금이 필수 안전 유동성 기준선 미만으로 하락 (minimum required reserve breach)",
      originalMetric: `${requiredLiquid.toFixed(2)} USDT-equivalent (필수)`,
      currentMetric: `${currentLiquid.toFixed(2)} USDT-equivalent (현재)`,
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
    .map((c) => `${c.reason} (${c.metricLabel ? `${c.metricLabel} ` : ""}${c.originalMetric} -> ${c.currentMetric})`)
    .join("; ");

  const origReturn = originalPlan.expectedNetYieldUsdtEquivalent === null
    ? null
    : toDecimal(originalPlan.expectedNetYieldUsdtEquivalent);
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
    originalExpectedReturnUsdtEquivalent: origReturn?.toFixed(2) ?? "UNAVAILABLE",
    newExpectedReturnUsdtEquivalent: newReturn?.toFixed(2) ?? "UNAVAILABLE",
    deltaReturnUsdtEquivalent: deltaReturn?.toFixed(2) ?? "UNAVAILABLE",
    deltaReturnPct: deltaReturn === null ? "UNAVAILABLE" : `${deltaReturn.gte(0) ? "+" : ""}${deltaPct}%`,
    proposedPlan,
  };
}
