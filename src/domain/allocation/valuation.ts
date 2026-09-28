import { Holding, NeedsProfile } from "./types";
import { Decimal, toDecimal } from "@/lib/math/decimal";

function isFiniteNonNegative(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
}

export function getHoldingUsdValue(holding: Holding): string | null {
  const amount = Number(holding.amount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (amount === 0) return "0";

  const valuation = holding.usdValuation;
  if (
    !valuation ||
    !isFiniteNonNegative(valuation.valueUsd) ||
    Number(valuation.valueUsd) <= 0 ||
    !valuation.source.trim()
  ) {
    return null;
  }
  return valuation.valueUsd;
}

export function hasCompleteUsdValuation(profile: NeedsProfile): boolean {
  return profile.holdings.length > 0 && profile.holdings.every(
    (holding) => getHoldingUsdValue(holding) !== null
  );
}

export function getPortfolioUsdValue(profile: NeedsProfile): string | null {
  if (!hasCompleteUsdValuation(profile)) return null;
  return profile.holdings.reduce(
    (total, holding) => total.plus(toDecimal(getHoldingUsdValue(holding)!)),
    toDecimal(0)
  ).toFixed(2);
}

export function getUsdValuationStatus(
  profile: NeedsProfile
): "SOURCE_BACKED" | "SNAPSHOT" | "SIMULATED" | "UNAVAILABLE" {
  if (!hasCompleteUsdValuation(profile)) return "UNAVAILABLE";
  if (profile.holdings.some((holding) => holding.usdValuation?.reality === "SIMULATED")) {
    return "SIMULATED";
  }
  if (profile.holdings.some((holding) => holding.usdValuation?.reality === "SNAPSHOT")) {
    return "SNAPSHOT";
  }
  return "SOURCE_BACKED";
}

export function hasFreshMainnetUsdValuation(
  profile: NeedsProfile,
  now: number,
  freshnessMs: number
): boolean {
  if (!hasCompleteUsdValuation(profile)) return false;
  return profile.holdings.every((holding) => {
    if (Number(holding.amount) === 0) return true;
    const valuation = holding.usdValuation;
    const fetchedAt = valuation?.fetchedAt ? Date.parse(valuation.fetchedAt) : Number.NaN;
    return valuation?.reality === "LIVE_MAINNET" &&
      Number.isFinite(fetchedAt) &&
      fetchedAt <= now &&
      now - fetchedAt <= freshnessMs;
  });
}

export function getHoldingUsdPerUnit(holding: Holding): Decimal | null {
  const amount = Number(holding.amount);
  const valueUsd = getHoldingUsdValue(holding);
  if (!Number.isFinite(amount) || amount <= 0 || valueUsd === null) return null;
  return toDecimal(valueUsd).div(holding.amount);
}
