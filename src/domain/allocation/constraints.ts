import {
  NeedsProfile,
  YieldOpportunity,
  AllocationLeg,
  ConstraintCheckResult,
} from "./types";
import { SafeMath, toDecimal, toPercentString, toUsdString } from "@/lib/math/decimal";
import { getRuleForType } from "./rules";
import { hasCompleteUsdValuation } from "./valuation";

export function evaluateHardConstraints(
  profile: NeedsProfile,
  totalCapitalUsd: string,
  allocations: AllocationLeg[],
  opportunities: YieldOpportunity[]
): {
  passed: boolean;
  checks: ConstraintCheckResult[];
} {
  const checks: ConstraintCheckResult[] = [];
  let allPassed = true;
  const valuationComplete = hasCompleteUsdValuation(profile);

  const totalCap = toDecimal(totalCapitalUsd);
  const liquidityRule = getRuleForType(profile.investmentRules, "MINIMUM_LIQUIDITY");
  const volatileRule = getRuleForType(profile.investmentRules, "MAX_VOLATILE_EXPOSURE");
  const minLiquid = toDecimal(liquidityRule?.value ?? profile.minimumLiquidUsd);

  if (!valuationComplete) allPassed = false;
  checks.push({
    key: "USD_VALUATION_EVIDENCE",
    name: "USD Valuation Evidence",
    passed: valuationComplete,
    required: "Every holding needs an explicit sourced USD valuation",
    actual: valuationComplete ? "Available" : "UNKNOWN",
    detail: valuationComplete
      ? "Every holding has an explicit USD value and recorded source/reality."
      : "One or more holdings lack a sourced USD valuation; exposure and reserve checks cannot be trusted.",
  });

  // 1. Calculate allocated capital and remaining liquid reserve
  let totalAllocatedUsd = toDecimal(0);
  let volatileAllocatedUsd = toDecimal(0);

  for (const leg of allocations) {
    const legVal = toDecimal(leg.usdValue);
    totalAllocatedUsd = totalAllocatedUsd.plus(legVal);

    const opp = opportunities.find((o) => o.id === leg.productId);
    const isVolatile = opp
      ? opp.priceRiskClass !== "LOW"
      : !["USDD", "USDT", "USD1", "TUSD"].includes(leg.asset);

    if (isVolatile) {
      volatileAllocatedUsd = volatileAllocatedUsd.plus(legVal);
    }
  }

  const liquidReserveUsd = totalCap.minus(totalAllocatedUsd);

  // Check 1: Minimum Liquid Reserve (Hard constraint)
  const passedLiquid = valuationComplete && liquidReserveUsd.gte(minLiquid);
  if (!passedLiquid) allPassed = false;
  checks.push({
    key: "MIN_LIQUIDITY",
    name: "Minimum Liquid Reserve",
    passed: passedLiquid,
    ruleId: liquidityRule?.id,
    ruleVersion: liquidityRule?.version,
    required: `>= ${toUsdString(minLiquid.toString())}`,
    actual: valuationComplete ? toUsdString(liquidReserveUsd.toString()) : "UNKNOWN",
    detail: passedLiquid
      ? `Maintains ${toUsdString(liquidReserveUsd.toString())} in reserve, exceeding required ${toUsdString(minLiquid.toString())}.`
      : valuationComplete
        ? `Liquid reserve ${toUsdString(liquidReserveUsd.toString())} falls below required ${toUsdString(minLiquid.toString())}.`
        : "Cannot evaluate the liquid reserve because USD valuation evidence is unavailable.",
  });

  // Check 2: Maximum Volatile Asset Exposure (Hard constraint)
  const maxVolatilePct = toDecimal(volatileRule?.value ?? profile.maxVolatileExposurePct);
  const actualVolatilePct = totalCap.gt(0)
    ? volatileAllocatedUsd.div(totalCap)
    : toDecimal(0);

  const passedVolatile = valuationComplete && actualVolatilePct.lte(maxVolatilePct.plus(0.0001)); // epsilon tolerance
  if (!passedVolatile) allPassed = false;
  checks.push({
    key: "MAX_VOLATILE_EXPOSURE",
    name: "Maximum Volatile Exposure",
    passed: passedVolatile,
    ruleId: volatileRule?.id,
    ruleVersion: volatileRule?.version,
    required: `<= ${toPercentString(maxVolatilePct.toString())}`,
    actual: valuationComplete ? toPercentString(actualVolatilePct.toString()) : "UNKNOWN",
    detail: passedVolatile
      ? `Volatile exposure is ${toPercentString(actualVolatilePct.toString())}, strictly within user limit of ${toPercentString(maxVolatilePct.toString())}.`
      : valuationComplete
        ? `Volatile exposure of ${toPercentString(actualVolatilePct.toString())} exceeds maximum permitted limit ${toPercentString(maxVolatilePct.toString())}.`
        : "Cannot evaluate volatile exposure because USD valuation evidence is unavailable.",
  });

  // Check 3: Holding Capacity Limits (Cannot allocate more than owned)
  let holdingsPassed = true;
  for (const h of profile.holdings) {
    const assetAllocated = allocations
      .filter((leg) => leg.asset === h.asset)
      .reduce((sum, leg) => sum.plus(toDecimal(leg.amount)), toDecimal(0));

    if (assetAllocated.gt(toDecimal(h.amount))) {
      holdingsPassed = false;
      allPassed = false;
      break;
    }
  }

  checks.push({
    key: "HOLDINGS_CAPACITY",
    name: "Holdings Capacity Limit",
    passed: holdingsPassed,
    required: "Allocations <= Wallet Holdings",
    actual: holdingsPassed ? "Within Balance" : "Exceeds Balance",
    detail: holdingsPassed
      ? "All planned allocations are strictly covered by current wallet balances."
      : "Allocations exceed available balance in one or more assets.",
  });

  // Check 4: Excluded Assets Check
  const excludedRules = profile.investmentRules?.filter((rule) => rule.type === "EXCLUDED_ASSET");
  const excluded = new Set(
    excludedRules?.length ? excludedRules.map((rule) => rule.value) : profile.excludedAssets || []
  );
  let excludedPassed = true;
  for (const leg of allocations) {
    if (excluded.has(leg.asset)) {
      excludedPassed = false;
      allPassed = false;
      break;
    }
  }

  checks.push({
    key: "EXCLUDED_ASSETS",
    name: "Excluded Assets Compliance",
    passed: excludedPassed,
    ruleId: excludedRules?.[0]?.id,
    ruleVersion: excludedRules?.[0]?.version,
    required: "Zero allocation to excluded assets",
    actual: excludedPassed ? "Compliant" : "Violation",
    detail: excludedPassed
      ? "No assets on user blacklist are included in the plan."
      : "Plan contains assets explicitly excluded by the user.",
  });

  return {
    passed: allPassed,
    checks,
  };
}
