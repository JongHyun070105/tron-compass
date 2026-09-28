import { Decimal, toDecimal, SafeMath } from "./decimal";

/**
 * Calculates estimated yield in USD over a given investment horizon.
 * Formula (Annual Compounding):
 *   Yield = Principal * ((1 + APY) ^ (horizonDays / 365) - 1)
 *
 * If APY is 0 or negative, returns "0".
 */
export function calculateHorizonYield(
  principalUsd: string | number | Decimal,
  apyRate: string | number | Decimal,
  horizonDays: number
): string {
  const p = toDecimal(principalUsd);
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
 * net earned USD, and horizon in days.
 */
export function calculateEffectiveApy(
  principalUsd: string | number | Decimal,
  netReturnUsd: string | number | Decimal,
  horizonDays: number
): string {
  const p = toDecimal(principalUsd);
  const r = toDecimal(netReturnUsd);

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
  baseYieldUsd: string;
  incentiveYieldUsd: string | null;
  totalCostUsd: string;
  netYieldUsd: string | null;
  effectiveNetApy: string | null;
}

/**
 * Decomposes yield into Base, Incentive, and Net after entry/exit costs.
 */
export function decomposeLegYield(
  usdValue: string,
  baseApy: string,
  incentiveApy: string | null | undefined,
  horizonDays: number,
  estimatedEntryCostUsd: string = "0",
  estimatedExitCostUsd: string = "0"
): YieldDecomposition {
  const baseYieldUsd = calculateHorizonYield(usdValue, baseApy, horizonDays);
  const totalCost = SafeMath.add(estimatedEntryCostUsd, estimatedExitCostUsd);
  if (incentiveApy === null || incentiveApy === undefined) {
    return {
      baseYieldUsd,
      incentiveYieldUsd: null,
      totalCostUsd: totalCost.toFixed(4),
      netYieldUsd: null,
      effectiveNetApy: null,
    };
  }

  const incentiveYieldUsd = calculateHorizonYield(usdValue, incentiveApy, horizonDays);
  const grossYield = SafeMath.add(baseYieldUsd, incentiveYieldUsd);
  const netYield = grossYield.minus(totalCost);

  const effectiveNetApy = calculateEffectiveApy(
    usdValue,
    netYield.toString(),
    horizonDays
  );

  return {
    baseYieldUsd,
    incentiveYieldUsd,
    totalCostUsd: totalCost.toFixed(4),
    netYieldUsd: netYield.toFixed(4),
    effectiveNetApy,
  };
}
