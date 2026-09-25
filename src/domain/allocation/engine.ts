import {
  NeedsProfile,
  YieldOpportunity,
  AllocationPlan,
  AllocationLeg,
} from "./types";
import { evaluateHardConstraints } from "./constraints";
import { decomposeLegYield } from "@/lib/math/yield";
import { Decimal, SafeMath, toDecimal, toPercentString } from "@/lib/math/decimal";
import { evaluateUsddDecisionSignal, UsddDecisionSignal } from "./usdd-signals";
import { UsddProtocolEvidence } from "@/lib/integrations/usdd/client";

const ASSET_PRICE_USD: Record<string, string> = {
  USDD: "1.00",
  USDT: "1.00",
  USD1: "1.00",
  TUSD: "1.00",
  TRX: "0.25", // Reasonable benchmark rate; updated via oracle in live mode
  sTRX: "0.26",
  SUN: "0.02",
  JST: "0.03",
  BTT: "0.000001",
};

export function getAssetPriceUsd(asset: string): string {
  return ASSET_PRICE_USD[asset.toUpperCase()] || "1.00";
}

export function computeTotalCapitalUsd(profile: NeedsProfile): string {
  let total = toDecimal(0);
  for (const h of profile.holdings) {
    if (h.estimatedUsd && parseFloat(h.estimatedUsd) > 0) {
      total = total.plus(toDecimal(h.estimatedUsd));
    } else {
      const price = getAssetPriceUsd(h.asset);
      const val = SafeMath.mul(h.amount, price);
      total = total.plus(val);
    }
  }
  return total.toFixed(2);
}

export function generateAllocationPlans(
  profile: NeedsProfile,
  opportunities: YieldOpportunity[],
  timestamp: string = new Date().toISOString(),
  usddEvidence?: UsddProtocolEvidence | null
): {
  plans: AllocationPlan[];
  totalCapitalUsd: string;
  usddSignal: UsddDecisionSignal;
} {
  const totalCapitalUsd = computeTotalCapitalUsd(profile);
  const totalCap = toDecimal(totalCapitalUsd);
  const minLiquid = toDecimal(profile.minimumLiquidUsd || "0");
  const maxAllocatable = totalCap.minus(minLiquid);

  // Evaluate verified USDD decision signal
  const usddSignal = evaluateUsddDecisionSignal(usddEvidence);

  // Active opportunities with USDD signal adjustments
  const activeOpps = opportunities
    .filter(
      (o) =>
        toDecimal(o.totalApy).gte(0) &&
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

    const price = toDecimal(getAssetPriceUsd(h.asset));
    const holdingVal = toDecimal(h.amount).times(price);

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
      opp.estimatedEntryCostUsd,
      opp.estimatedExitCostUsd
    );

    planAAllocations.push({
      asset: h.asset,
      productId: opp.id,
      productName: opp.product,
      protocol: opp.protocol,
      amount: allocAmount.toFixed(4),
      usdValue: allocVal.toFixed(2),
      allocationPct: totalCap.gt(0)
        ? allocVal.div(totalCap).toFixed(4)
        : "0",
      baseApy: opp.baseApy,
      incentiveApy: opp.incentiveApy,
      totalApy: opp.totalApy,
      baseYieldEstimateUsd: decomp.baseYieldUsd,
      incentiveYieldEstimateUsd: decomp.incentiveYieldUsd,
      estimatedCostUsd: decomp.totalCostUsd,
      netYieldEstimateUsd: decomp.netYieldUsd,
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

    const price = toDecimal(getAssetPriceUsd(h.asset));
    const holdingVal = toDecimal(h.amount).times(price);

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
      opp.estimatedEntryCostUsd,
      opp.estimatedExitCostUsd
    );

    planBAllocations.push({
      asset: h.asset,
      productId: opp.id,
      productName: opp.product,
      protocol: opp.protocol,
      amount: allocAmount.toFixed(4),
      usdValue: allocVal.toFixed(2),
      allocationPct: totalCap.gt(0)
        ? allocVal.div(totalCap).toFixed(4)
        : "0",
      baseApy: opp.baseApy,
      incentiveApy: opp.incentiveApy,
      totalApy: opp.totalApy,
      baseYieldEstimateUsd: decomp.baseYieldUsd,
      incentiveYieldEstimateUsd: decomp.incentiveYieldUsd,
      estimatedCostUsd: decomp.totalCostUsd,
      netYieldEstimateUsd: decomp.netYieldUsd,
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

    for (const leg of allocations) {
      totalAlloc = totalAlloc.plus(toDecimal(leg.usdValue));
      totalBaseYield = totalBaseYield.plus(toDecimal(leg.baseYieldEstimateUsd));
      totalIncentiveYield = totalIncentiveYield.plus(
        toDecimal(leg.incentiveYieldEstimateUsd)
      );
      totalCosts = totalCosts.plus(toDecimal(leg.estimatedCostUsd));
      totalNetYield = totalNetYield.plus(toDecimal(leg.netYieldEstimateUsd));
    }

    const liquidReserve = totalCap.minus(totalAlloc);
    const liquidReservePct = totalCap.gt(0)
      ? liquidReserve.div(totalCap).toFixed(4)
      : "1.0000";

    const constraintEval = evaluateHardConstraints(
      profile,
      totalCapitalUsd,
      allocations,
      opportunities
    );

    const netApy = totalAlloc.gt(0)
      ? totalNetYield
          .div(totalAlloc)
          .times(new Decimal(365).div(horizonDays))
          .toFixed(4)
      : "0.0000";

    // Build concise, deterministic reasons
    const deterministicReasons: string[] = [
      allocations.length === 0
        ? "사용자 요청으로 전체 자본을 100% 무위험 상시 비상금으로 보존합니다."
        : `요청하신 $${minLiquid.toFixed(0)} 이상의 비상금($${liquidReserve.toFixed(0)})을 상시 인출 가능하게 100% 보존합니다`,
      profile.protectionClause
        ? `보호 조건 준수: ${profile.protectionClause}`
        : `변동성 자산(TRX) 노출을 최대 허용치(${(parseFloat(profile.maxVolatileExposurePct || "0.20") * 100).toFixed(0)}%) 이내로 엄격히 제한했습니다`,
      "모든 편입 포지션의 락업 기간이 0일로 시장 유동성에 따라 상시 회수 가능합니다",
      usddSignal.reason,
      strategyType === "LIQUIDITY_FIRST"
        ? "원금 방어와 즉각적 유동성을 최우선으로 하여 저위험 렌딩 풀에 안전하게 배분했습니다"
        : "안전 마진을 유지한 상태에서 JustLend 인센티브 마이닝을 복합 배분하여 복리 수익을 극대화합니다",
    ];

    const adjustedRiskScore = Math.max(1, Math.min(100, baseRiskScore - usddSignal.scoreBonus));

    return {
      id,
      label,
      strategyType,
      description,
      createdAt: timestamp,
      horizonDays,
      totalCapitalUsd,
      liquidReserveUsd: liquidReserve.toFixed(2),
      liquidReservePct: toPercentString(liquidReservePct),
      allocations,
      expectedBaseYieldUsd: totalBaseYield.toFixed(2),
      expectedIncentiveYieldUsd: totalIncentiveYield.toFixed(2),
      estimatedTotalCostUsd: totalCosts.toFixed(2),
      expectedNetYieldUsd: totalNetYield.toFixed(2),
      effectiveNetApy: toPercentString(netApy),
      liquidityScore: baseLiquidityScore,
      riskScore: adjustedRiskScore,
      risks:
        strategyType === "LIQUIDITY_FIRST"
          ? [
              "Low smart-contract counterparty risk with JustLend DAO core lending pool",
              "Minimal volatility exposure with strong buffer above required liquidity reserve",
            ]
          : [
              "Variable mining incentive APY is subject to JustLend DAO emission schedule",
              "Moderate smart contract interaction with lending protocol and testnet execution sandbox",
            ],
      exitConditions: [
        "Unallocated liquid reserve is accessible instantly in wallet without gas cost",
        "JustLend positions can be redeemed on-demand subject to market liquidity and transaction energy",
      ],
      assumptions: [
        `Investment horizon is ${horizonDays} days`,
        "Base lending APY compounds continuously with block-level utilization",
        "Ecosystem mining rewards remain active during estimated holding period",
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
    "Prioritizes high liquid cash buffer, minimal volatile exposure, and instant exit flexibility while earning steady base protocol yield.",
    planAAllocations,
    92,
    18
  );

  const planB = compilePlan(
    "plan-yield-oriented",
    "Plan B: Yield-Oriented",
    "YIELD_ORIENTED",
    "Maximizes net annualized yield within allowable non-reserve capacity and volatile asset limits, utilizing JustLend incentive mining.",
    planBAllocations,
    72,
    34
  );

  return {
    plans: [planA, planB],
    totalCapitalUsd,
    usddSignal,
  };
}
