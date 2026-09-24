import {
  AllocationPlan,
  NeedsProfile,
  YieldOpportunity,
} from "../allocation/types";
import { generateAllocationPlans } from "../allocation/engine";
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

  // 1. Check APY drop on allocated products
  for (const leg of originalPlan.allocations) {
    const currentOpp = currentOpportunities.find((o) => o.id === leg.productId);
    if (!currentOpp) continue;

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
        reason: `${leg.productName} APY significantly decayed`,
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
      reason: "Available liquid buffer breached minimum required reserve",
      originalMetric: `$${requiredLiquid.toFixed(2)} (Required)`,
      currentMetric: `$${currentLiquid.toFixed(2)} (Current)`,
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
    : "No rebalance required: positions remain compliant with return & risk targets.";

  const marketDeltaSummary = checks
    .map((c) => `${c.reason} (${c.originalMetric} -> ${c.currentMetric})`)
    .join("; ");

  return {
    triggered: shouldTrigger,
    checks,
    primaryReason,
    marketDeltaSummary: marketDeltaSummary || "Market conditions stable within tolerance bands.",
    proposedPlan,
  };
}
