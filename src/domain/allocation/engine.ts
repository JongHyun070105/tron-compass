import {
  NeedsProfile,
  YieldOpportunity,
  AllocationPlan,
  AllocationLeg,
} from "./types";
import { evaluateDecisionRules } from "./rules";
import { decomposeLegYield } from "@/lib/math/yield";
import { Decimal, SafeMath, toDecimal, toPercentString } from "@/lib/math/decimal";
import { evaluateUsddDecisionSignal, UsddDecisionSignal } from "./usdd-signals";
import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";
import { getHoldingValuePerUnit, getHoldingValue, getPortfolioValue, getValuationStatus } from "./valuation";

export function computeTotalCapitalValue(profile: NeedsProfile, now: number = Date.now()): string {
  return getPortfolioValue(profile, now) ?? "0.00";
}

export function generateAllocationPlans(
  profile: NeedsProfile,
  opportunities: YieldOpportunity[],
  timestamp: string = new Date().toISOString(),
  usddEvidence?: UsddProtocolEvidence | null
): {
  plans: AllocationPlan[];
  totalCapitalUsdtEquivalent: string;
  usddSignal: UsddDecisionSignal;
} {
  const parsedTimestamp = Date.parse(timestamp);
  const evaluationAt = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
  const totalCapitalUsdtEquivalent = computeTotalCapitalValue(profile, evaluationAt);
  const totalCap = toDecimal(totalCapitalUsdtEquivalent);
  const minLiquid = toDecimal(profile.minimumLiquidUsdtEquivalent || "0");
  const maxAllocatable = totalCap.minus(minLiquid);

  // Evaluate verified USDD decision signal
  const usddSignal = evaluateUsddDecisionSignal(usddEvidence);

  // Active opportunities with USDD signal adjustments
  const activeOpps = opportunities
    .filter(
      (o) =>
        toDecimal(o.totalApy ?? o.baseApy).gte(0) &&
        !(profile.excludedAssets || []).includes(o.asset)
    )
    .map((o) => {
      if (o.asset === "USDD") {
        return {
          ...o,
          priceRiskClass: usddSignal.priceRiskClass,
          warnings: usddSignal.warningNotice
            ? [...o.warnings, usddSignal.warningNotice]
            : o.warnings,
        };
      }
      return o;
    });

  const horizonDays = profile.horizonDays > 0 ? profile.horizonDays : 90;

  // -------------------------------------------------------------
  // Plan A: Liquidity-First Plan
  // -------------------------------------------------------------
  const planAAllocations: AllocationLeg[] = [];
  // Allocate up to 50% of available capital or maxAllocatable, whichever is smaller.
  // If maxAllocatable <= 0 (e.g. 100% liquidity required), target cap is strictly 0.
  const planATargetCap = SafeMath.gt(maxAllocatable, 0)
    ? Decimal.min(maxAllocatable, totalCap.times(0.50))
    : toDecimal(0);

  let planARemaining = planATargetCap;
  const maxVolatileBudgetA = totalCap.times(
    toDecimal(profile.maxVolatileExposurePct || "0.20")
  );
  let volatileUsedA = toDecimal(0);

  for (const h of profile.holdings) {
    if (planARemaining.lte(0)) break;
    // If USDD is ineligible for conservative Plan A due to collateral signal, skip it
    if (h.asset === "USDD" && !usddSignal.eligibleForConservativePlan) {
      continue;
    }

    const price = getHoldingValuePerUnit(h, evaluationAt);
    const holdingValue = getHoldingValue(h, evaluationAt);
    if (!price || price.lte(0) || holdingValue === null) continue;
    const holdingVal = toDecimal(holdingValue);

    // Find best opportunity for this asset
    const opp = activeOpps.find((o) => o.asset === h.asset && o.priceRiskClass === "LOW") ||
                activeOpps.find((o) => o.asset === h.asset);

    if (!opp) continue;

    const isVolatile = opp.priceRiskClass !== "LOW";
    let maxAllowedForLeg = holdingVal.times(0.70);

    if (isVolatile) {
      const remainingVolBudget = maxVolatileBudgetA.minus(volatileUsedA);
      if (remainingVolBudget.lte(0)) continue;
      maxAllowedForLeg = Decimal.min(maxAllowedForLeg, remainingVolBudget);
    }

    // Allocate conservative portion
    const allocVal = Decimal.min(planARemaining, maxAllowedForLeg);
    if (allocVal.lte(0)) continue;

    if (isVolatile) {
      volatileUsedA = volatileUsedA.plus(allocVal);
    }

    const allocAmount = allocVal.div(price);
    const decomp = decomposeLegYield(
      allocVal.toString(),
      opp.baseApy,
      opp.incentiveApy,
      horizonDays,
      opp.estimatedEntryCostUsdtEquivalent,
      opp.estimatedExitCostUsdtEquivalent
    );

    planAAllocations.push({
      asset: h.asset,
      productId: opp.id,
      productName: opp.product,
      protocol: opp.protocol,
      amount: allocAmount.toFixed(4),
      valueUsdtEquivalent: allocVal.toFixed(2),
      allocationPct: totalCap.gt(0)
        ? allocVal.div(totalCap).toFixed(4)
        : "0",
      baseApy: opp.baseApy,
      incentiveApy: opp.incentiveApy,
      totalApy: opp.totalApy,
      baseYieldEstimateUsdtEquivalent: decomp.baseYieldUsdtEquivalent,
      incentiveYieldEstimateUsdtEquivalent: decomp.incentiveYieldUsdtEquivalent,
      estimatedCostUsdtEquivalent: decomp.totalCostUsdtEquivalent,
      netYieldEstimateUsdtEquivalent: decomp.netYieldUsdtEquivalent,
      executable: opp.executable,
      executabilityClass: opp.executabilityClass || (opp.executable ? "NILE_EXECUTABLE" : "LIVE_DATA_ONLY"),
      executabilityLabel: opp.executabilityLabel || (opp.executable ? "실행 가능 (Nile에서 직접 테스트 가능)" : "분석 전용 (Mainnet 시장 데이터 기반)"),
      executionNetwork: opp.executionNetwork,
      targetContract: opp.nileContractAddress || opp.contractAddress,
    });

    planARemaining = planARemaining.minus(allocVal);
  }

  // -------------------------------------------------------------
  // Plan B: Yield-Oriented Plan
  // -------------------------------------------------------------
  const planBAllocations: AllocationLeg[] = [];
  let planBRemaining = SafeMath.gt(maxAllocatable, 0)
    ? maxAllocatable
    : toDecimal(0);

  const maxVolatileBudget = totalCap.times(
    toDecimal(profile.maxVolatileExposurePct || "0.20")
  );
  let volatileUsed = toDecimal(0);

  // Sort holdings to prioritize higher APY opportunities
  for (const h of profile.holdings) {
    if (planBRemaining.lte(0)) break;
    // If USDD is flagged as critical, skip yield allocation
    if (h.asset === "USDD" && !usddSignal.eligibleForYieldPlan) {
      continue;
    }

    const price = getHoldingValuePerUnit(h, evaluationAt);
    const holdingValue = getHoldingValue(h, evaluationAt);
    if (!price || price.lte(0) || holdingValue === null) continue;
    const holdingVal = toDecimal(holdingValue);

    // Find matching opportunity
    const opp = activeOpps.find((o) => o.asset === h.asset);
    if (!opp) continue;

    const isVolatile = opp.priceRiskClass !== "LOW";
    let maxAllowedForLeg = holdingVal;

    if (isVolatile) {
      const remainingVolBudget = maxVolatileBudget.minus(volatileUsed);
      if (remainingVolBudget.lte(0)) continue;
      maxAllowedForLeg = Decimal.min(maxAllowedForLeg, remainingVolBudget);
    }

    const allocVal = Decimal.min(planBRemaining, maxAllowedForLeg);
    if (allocVal.lte(0)) continue;

    if (isVolatile) {
      volatileUsed = volatileUsed.plus(allocVal);
    }

    const allocAmount = allocVal.div(price);
    const decomp = decomposeLegYield(
      allocVal.toString(),
      opp.baseApy,
      opp.incentiveApy,
      horizonDays,
      opp.estimatedEntryCostUsdtEquivalent,
      opp.estimatedExitCostUsdtEquivalent
    );

    planBAllocations.push({
      asset: h.asset,
      productId: opp.id,
      productName: opp.product,
      protocol: opp.protocol,
      amount: allocAmount.toFixed(4),
      valueUsdtEquivalent: allocVal.toFixed(2),
      allocationPct: totalCap.gt(0)
        ? allocVal.div(totalCap).toFixed(4)
        : "0",
      baseApy: opp.baseApy,
      incentiveApy: opp.incentiveApy,
      totalApy: opp.totalApy,
      baseYieldEstimateUsdtEquivalent: decomp.baseYieldUsdtEquivalent,
      incentiveYieldEstimateUsdtEquivalent: decomp.incentiveYieldUsdtEquivalent,
      estimatedCostUsdtEquivalent: decomp.totalCostUsdtEquivalent,
      netYieldEstimateUsdtEquivalent: decomp.netYieldUsdtEquivalent,
      executable: opp.executable,
      executabilityClass: opp.executabilityClass || (opp.executable ? "NILE_EXECUTABLE" : "LIVE_DATA_ONLY"),
      executabilityLabel: opp.executabilityLabel || (opp.executable ? "실행 가능 (Nile에서 직접 테스트 가능)" : "분석 전용 (Mainnet 시장 데이터 기반)"),
      executionNetwork: opp.executionNetwork,
      targetContract: opp.nileContractAddress || opp.contractAddress,
    });

    planBRemaining = planBRemaining.minus(allocVal);
  }

  // Helper to compile plan metrics and deterministic reasons
  const compilePlan = (
    id: string,
    label: string,
    strategyType: "LIQUIDITY_FIRST" | "YIELD_ORIENTED",
    description: string,
    allocations: AllocationLeg[],
    baseLiquidityScore: number,
    baseRiskScore: number
  ): AllocationPlan => {
    let totalAlloc = toDecimal(0);
    let totalBaseYield = toDecimal(0);
    let totalIncentiveYield = toDecimal(0);
    let totalCosts = toDecimal(0);
    let totalNetYield = toDecimal(0);
    let incentiveYieldAvailable = true;
    let netYieldAvailable = true;

    for (const leg of allocations) {
      totalAlloc = totalAlloc.plus(toDecimal(leg.valueUsdtEquivalent));
      totalBaseYield = totalBaseYield.plus(toDecimal(leg.baseYieldEstimateUsdtEquivalent));
      if (leg.incentiveYieldEstimateUsdtEquivalent === null) {
        incentiveYieldAvailable = false;
      } else {
        totalIncentiveYield = totalIncentiveYield.plus(
          toDecimal(leg.incentiveYieldEstimateUsdtEquivalent)
        );
      }
      totalCosts = totalCosts.plus(toDecimal(leg.estimatedCostUsdtEquivalent));
      if (leg.netYieldEstimateUsdtEquivalent === null) {
        netYieldAvailable = false;
      } else {
        totalNetYield = totalNetYield.plus(toDecimal(leg.netYieldEstimateUsdtEquivalent));
      }
    }

    const liquidReserve = totalCap.minus(totalAlloc);
    const liquidReservePct = totalCap.gt(0)
      ? liquidReserve.div(totalCap).toFixed(4)
      : "1.0000";

    const constraintEval = evaluateDecisionRules(
      profile,
      totalCapitalUsdtEquivalent,
      allocations,
      opportunities,
      evaluationAt
    );

    const netApy = netYieldAvailable && totalAlloc.gt(0)
      ? totalNetYield
          .div(totalAlloc)
          .times(new Decimal(365).div(horizonDays))
          .toFixed(4)
      : totalAlloc.eq(0) ? "0.0000" : null;

    // Build concise, deterministic reasons
    const deterministicReasons: string[] = [
      allocations.length === 0
        ? getValuationStatus(profile, evaluationAt) === "UNAVAILABLE"
          ? "Live USDT-equivalent valuation is unavailable; no allocation was generated."
          : "No allocation was generated because available evidence and confirmed rules did not support one."
        : `Estimated unallocated reserve is ${liquidReserve.toFixed(2)} USDT-equivalent; withdrawal availability depends on wallet balance, pool liquidity, and transaction resources.`,
      profile.protectionClause
        ? `보호 조건 준수: ${profile.protectionClause}`
        : `The confirmed maximum volatile exposure is ${toPercentString(profile.maxVolatileExposurePct || "0.20")}.`,
      "Exit timing depends on pool liquidity and transaction resources; immediate or fee-free withdrawal is not guaranteed.",
      usddSignal.reason,
      strategyType === "LIQUIDITY_FIRST"
        ? "This option prioritizes reserve size among the opportunities and evidence recorded here."
        : !incentiveYieldAvailable
          ? "This option uses observed base rates; unavailable incentives remain unknown and are excluded from net return."
          : allocations.some((leg) => leg.incentiveApy !== null && toDecimal(leg.incentiveApy).gt(0))
            ? "This option separately includes observed base yield and source-backed USDD mining rewards."
            : "No active USDD mining reward was observed for these allocations; return estimates use base yield.",
    ];

    const adjustedRiskScore = Math.max(1, Math.min(100, baseRiskScore - usddSignal.scoreBonus));

    return {
      id,
      label,
      strategyType,
      description,
      createdAt: timestamp,
      horizonDays,
      totalCapitalUsdtEquivalent,
      valuationStatus: getValuationStatus(profile, evaluationAt),
      liquidReserveUsdtEquivalent: liquidReserve.toFixed(2),
      liquidReservePct: toPercentString(liquidReservePct),
      allocations,
      expectedBaseYieldUsdtEquivalent: totalBaseYield.toFixed(2),
      expectedIncentiveYieldUsdtEquivalent: incentiveYieldAvailable ? totalIncentiveYield.toFixed(2) : null,
      estimatedTotalCostUsdtEquivalent: totalCosts.toFixed(2),
      expectedNetYieldUsdtEquivalent: netYieldAvailable ? totalNetYield.toFixed(2) : null,
      effectiveNetApy: netApy === null ? null : toPercentString(netApy),
      liquidityScore: baseLiquidityScore,
      riskScore: adjustedRiskScore,
      risks:
        strategyType === "LIQUIDITY_FIRST"
          ? [
              "Protocol and asset risks remain; estimated returns do not guarantee principal or liquidity.",
              "The allocation is limited by the confirmed reserve and exposure rules.",
            ]
          : [
              !incentiveYieldAvailable
                ? "Incentive rewards are unknown because the separate mining feed is unavailable; net returns cannot be computed."
                : "Source-backed base and incentive rates may change during the holding period.",
              "Any protocol interaction carries smart-contract, liquidity, and transaction-resource risks.",
            ],
      exitConditions: [
        "Unallocated assets remain in the wallet; transaction fees may apply to moving them.",
        "JustLend redemption timing depends on market liquidity and transaction resources.",
      ],
      assumptions: [
        `Investment horizon is ${horizonDays} days`,
        "Yield uses annual APY compounding over the recorded horizon; the protocol rate may change during that period.",
        incentiveYieldAvailable
          ? "Any source-backed incentive rate may change during the recorded horizon"
          : "Incentive APY is unavailable and is not included in the net return calculation",
      ],
      deterministicReasons,
      sourceSnapshotIds: opportunities.map((o) => o.id),
      constraintChecks: constraintEval.checks,
    };
  };

  const planA = compilePlan(
    "plan-liquidity-first",
    "Plan A: Liquidity-First",
    "LIQUIDITY_FIRST",
    "Prioritizes a larger unallocated reserve and lower volatile exposure within the available evidence and rules.",
    planAAllocations,
    92,
    18
  );

  const planB = compilePlan(
    "plan-yield-oriented",
    "Plan B: Yield-Oriented",
    "YIELD_ORIENTED",
    "Allocates within confirmed reserve and volatile-exposure limits using the available source-backed market rates.",
    planBAllocations,
    72,
    34
  );

  return {
    plans: [planA, planB],
    totalCapitalUsdtEquivalent,
    usddSignal,
  };
}
