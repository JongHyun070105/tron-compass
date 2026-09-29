import { Decimal, toDecimal, SafeMath } from "./decimal";

/**
 * Calculates estimated yield in the portfolio's USDT-equivalent denomination.
 * Formula (Annual Compounding):
 *   Yield = Principal * ((1 + APY) ^ (horizonDays / 365) - 1)
 *
 * If APY is 0 or negative, returns "0".
 */
export function calculateHorizonYield(
  principalValue: string | number | Decimal,
  apyRate: string | number | Decimal,
  horizonDays: number
): string {
  const p = toDecimal(principalValue);
  const apy = toDecimal(apyRate);

  if (p.lte(0) || apy.lte(0) || horizonDays <= 0) {
    return "0";
  }

  // time fraction: horizonDays / 365
  const timeFactor = new Decimal(horizonDays).div(365);

  // (1 + apy) ^ (horizonDays / 365)
  const growthFactor = new Decimal(1).plus(apy).pow(timeFactor);
  const estimatedReturn = p.times(growthFactor.minus(1));

  return estimatedReturn.toFixed(4);
}

/**
 * Calculates the net effective annual percentage yield (APY) given principal,
 * net earned USDT-equivalent value, and horizon in days.
 */
export function calculateEffectiveApy(
  principalValue: string | number | Decimal,
  netReturnValue: string | number | Decimal,
  horizonDays: number
): string {
  const p = toDecimal(principalValue);
  const r = toDecimal(netReturnValue);

  if (p.lte(0) || horizonDays <= 0) {
    return "0";
  }

  const finalValue = p.plus(r);
  if (finalValue.lte(0)) {
    return "-1";
  }

  // (Final / Principal) ^ (365 / horizonDays) - 1
  const annualFactor = new Decimal(365).div(horizonDays);
  const ratio = finalValue.div(p);
  const effectiveApy = ratio.pow(annualFactor).minus(1);

  return effectiveApy.toFixed(6);
}

export interface YieldDecomposition {
  baseYieldUsdtEquivalent: string;
  incentiveYieldUsdtEquivalent: string | null;
  totalCostUsdtEquivalent: string;
  netYieldUsdtEquivalent: string | null;
  effectiveNetApy: string | null;
}

/**
 * Decomposes yield into Base, Incentive, and Net after entry/exit costs.
 */
export function decomposeLegYield(
  valueUsdtEquivalent: string,
  baseApy: string,
  incentiveApy: string | null | undefined,
  horizonDays: number,
  estimatedEntryCostUsdtEquivalent: string = "0",
  estimatedExitCostUsdtEquivalent: string = "0"
): YieldDecomposition {
  const baseYieldUsdtEquivalent = calculateHorizonYield(valueUsdtEquivalent, baseApy, horizonDays);
  const totalCost = SafeMath.add(estimatedEntryCostUsdtEquivalent, estimatedExitCostUsdtEquivalent);
  if (incentiveApy === null || incentiveApy === undefined) {
    return {
      baseYieldUsdtEquivalent,
      incentiveYieldUsdtEquivalent: null,
      totalCostUsdtEquivalent: totalCost.toFixed(4),
      netYieldUsdtEquivalent: null,
      effectiveNetApy: null,
    };
  }

  const incentiveYieldUsdtEquivalent = calculateHorizonYield(valueUsdtEquivalent, incentiveApy, horizonDays);
  const grossYield = SafeMath.add(baseYieldUsdtEquivalent, incentiveYieldUsdtEquivalent);
  const netYield = grossYield.minus(totalCost);

  const effectiveNetApy = calculateEffectiveApy(
    valueUsdtEquivalent,
    netYield.toString(),
    horizonDays
  );

  return {
    baseYieldUsdtEquivalent,
    incentiveYieldUsdtEquivalent,
    totalCostUsdtEquivalent: totalCost.toFixed(4),
    netYieldUsdtEquivalent: netYield.toFixed(4),
    effectiveNetApy,
  };
}
