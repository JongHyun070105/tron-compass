import {
  NeedsProfile,
  YieldOpportunity,
  AllocationLeg,
  ConstraintCheckResult,
} from "./types";
import { SafeMath, toDecimal, toPercentString } from "@/lib/math/decimal";
import { getRuleForType } from "./rules";
import { hasCompleteValuation } from "./valuation";

export function evaluateHardConstraints(
  profile: NeedsProfile,
  totalCapitalUsdtEquivalent: string,
  allocations: AllocationLeg[],
  opportunities: YieldOpportunity[],
  now: number = Date.now()
): {
  passed: boolean;
  checks: ConstraintCheckResult[];
} {
  const checks: ConstraintCheckResult[] = [];
  let allPassed = true;
  const valuationComplete = hasCompleteValuation(profile, now);

  const totalCap = toDecimal(totalCapitalUsdtEquivalent);
  const liquidityRule = getRuleForType(profile.investmentRules, "MINIMUM_LIQUIDITY");
  const volatileRule = getRuleForType(profile.investmentRules, "MAX_VOLATILE_EXPOSURE");
  const minLiquid = toDecimal(liquidityRule?.value ?? profile.minimumLiquidUsdtEquivalent);

  if (!valuationComplete) allPassed = false;
  checks.push({
    key: "USDT_EQUIVALENT_VALUATION_EVIDENCE",
    name: "USDT-equivalent Valuation Evidence",
    passed: valuationComplete,
    required: "Every holding needs a fresh live JustLend USDT-equivalent valuation",
    actual: valuationComplete ? "Available" : "UNKNOWN",
    detail: valuationComplete
      ? "Every user-declared holding has a fresh value from the same live JustLend mainnet snapshot."
      : "One or more holdings lack a fresh live USDT-equivalent valuation; exposure and reserve checks cannot be trusted.",
  });

  // 1. Calculate allocated capital and remaining liquid reserve
  let totalAllocatedValue = toDecimal(0);
  let volatileAllocatedValue = toDecimal(0);

  for (const leg of allocations) {
    const legVal = toDecimal(leg.valueUsdtEquivalent);
    totalAllocatedValue = totalAllocatedValue.plus(legVal);

    const opp = opportunities.find((o) => o.id === leg.productId);
    const isVolatile = opp
      ? opp.priceRiskClass !== "LOW"
      : !["USDD", "USDT", "USD1", "TUSD"].includes(leg.asset);

    if (isVolatile) {
      volatileAllocatedValue = volatileAllocatedValue.plus(legVal);
    }
  }

  const liquidReserveUsdtEquivalent = totalCap.minus(totalAllocatedValue);

  // Check 1: Minimum Liquid Reserve (Hard constraint)
  const passedLiquid = valuationComplete && liquidReserveUsdtEquivalent.gte(minLiquid);
  if (!passedLiquid) allPassed = false;
  checks.push({
    key: "MIN_LIQUIDITY",
    name: "Minimum Liquid Reserve",
    passed: passedLiquid,
    ruleId: liquidityRule?.id,
    ruleVersion: liquidityRule?.version,
    required: `>= ${minLiquid.toFixed(2)} USDT-equivalent`,
    actual: valuationComplete ? `${liquidReserveUsdtEquivalent.toFixed(2)} USDT-equivalent` : "UNKNOWN",
    detail: passedLiquid
      ? `Maintains ${liquidReserveUsdtEquivalent.toFixed(2)} USDT-equivalent in reserve, exceeding required ${minLiquid.toFixed(2)} USDT-equivalent.`
      : valuationComplete
        ? `Liquid reserve ${liquidReserveUsdtEquivalent.toFixed(2)} USDT-equivalent falls below required ${minLiquid.toFixed(2)} USDT-equivalent.`
        : "Cannot evaluate the liquid reserve because live USDT-equivalent valuation evidence is unavailable.",
  });

  // Check 2: Maximum Volatile Asset Exposure (Hard constraint)
  const maxVolatilePct = toDecimal(volatileRule?.value ?? profile.maxVolatileExposurePct);
  const actualVolatilePct = totalCap.gt(0)
    ? volatileAllocatedValue.div(totalCap)
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
        : "Cannot evaluate volatile exposure because live USDT-equivalent valuation evidence is unavailable.",
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
