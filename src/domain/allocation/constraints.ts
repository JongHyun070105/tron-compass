import {
  NeedsProfile,
  YieldOpportunity,
  AllocationLeg,
  ConstraintCheckResult,
} from "./types";
import { SafeMath, toDecimal, toPercentString, toUsdString } from "@/lib/math/decimal";

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

  const totalCap = toDecimal(totalCapitalUsd);
  const minLiquid = toDecimal(profile.minimumLiquidUsd);

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
  const passedLiquid = liquidReserveUsd.gte(minLiquid);
  if (!passedLiquid) allPassed = false;
  checks.push({
    key: "MIN_LIQUIDITY",
    name: "Minimum Liquid Reserve",
    passed: passedLiquid,
    required: `>= ${toUsdString(minLiquid.toString())}`,
    actual: toUsdString(liquidReserveUsd.toString()),
    detail: passedLiquid
      ? `Maintains ${toUsdString(liquidReserveUsd.toString())} in reserve, exceeding required ${toUsdString(minLiquid.toString())}.`
      : `Liquid reserve ${toUsdString(liquidReserveUsd.toString())} falls below required ${toUsdString(minLiquid.toString())}.`,
  });

  // Check 2: Maximum Volatile Asset Exposure (Hard constraint)
  const maxVolatilePct = toDecimal(profile.maxVolatileExposurePct);
  const actualVolatilePct = totalCap.gt(0)
    ? volatileAllocatedUsd.div(totalCap)
    : toDecimal(0);

  const passedVolatile = actualVolatilePct.lte(maxVolatilePct.plus(0.0001)); // epsilon tolerance
  if (!passedVolatile) allPassed = false;
  checks.push({
    key: "MAX_VOLATILE_EXPOSURE",
    name: "Maximum Volatile Exposure",
    passed: passedVolatile,
    required: `<= ${toPercentString(maxVolatilePct.toString())}`,
    actual: toPercentString(actualVolatilePct.toString()),
    detail: passedVolatile
      ? `Volatile exposure is ${toPercentString(actualVolatilePct.toString())}, strictly within user limit of ${toPercentString(maxVolatilePct.toString())}.`
      : `Volatile exposure of ${toPercentString(actualVolatilePct.toString())} exceeds maximum permitted limit ${toPercentString(maxVolatilePct.toString())}.`,
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
  const excluded = new Set(profile.excludedAssets || []);
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
