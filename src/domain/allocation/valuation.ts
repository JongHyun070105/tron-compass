import { AssetValuation, Holding, NeedsProfile, YieldOpportunity } from "./types";
import { Decimal, toDecimal } from "@/lib/math/decimal";
import { JUSTLEND_MAINNET_CONTRACTS } from "@/lib/integrations/justlend/contracts";

export const JUSTLEND_VALUATION_SOURCE = "https://openapi.just.network/lend/jtoken";
export const VALUATION_FRESHNESS_MS = 5 * 60 * 1000;

function parsePositiveDecimal(value: string | undefined): Decimal | null {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() && parsed.gt(0) ? parsed : null;
  } catch {
    return null;
  }
}

function freshTimestamp(value: string | null | undefined, now: number): boolean {
  if (!value) return false;
  const fetchedAt = Date.parse(value);
  return Number.isFinite(fetchedAt) && fetchedAt <= now && now - fetchedAt <= VALUATION_FRESHNESS_MS;
}

function marketIsLiveMainnet(market: YieldOpportunity): boolean {
  return market.network === "MAINNET" &&
    market.reality === "LIVE_MAINNET" &&
    market.sourceUrl === JUSTLEND_VALUATION_SOURCE;
}

function unavailableValuation(
  holding: Holding,
  fetchedAt: string | null,
  stale: boolean,
  derivation: string
): AssetValuation {
  return {
    asset: holding.asset,
    amount: holding.amount,
    denomination: "USDT",
    source: JUSTLEND_VALUATION_SOURCE,
    fetchedAt,
    reality: "UNAVAILABLE",
    derivation,
    stale,
  };
}

/**
 * Values user-declared planning quantities against one live JustLend mainnet
 * market snapshot. Nile wallet balances are execution capacity and are never
 * converted into a mainnet portfolio here.
 */
export function valueUserDeclaredHoldings(
  holdings: Holding[],
  markets: YieldOpportunity[],
  now: number = Date.now()
): Holding[] {
  const liveMarkets = markets.filter(marketIsLiveMainnet);
  const usdtCandidates = liveMarkets.filter((market) =>
    market.asset === "USDT" &&
    market.contractAddress === JUSTLEND_MAINNET_CONTRACTS.jTokens.jUSDT.base58 &&
    market.underlyingAddress === JUSTLEND_MAINNET_CONTRACTS.usdtToken
  );
  const usdtMarket = usdtCandidates.length === 1 ? usdtCandidates[0] : null;
  const usdtPrice = parsePositiveDecimal(usdtMarket?.underlyingPriceInTrx);
  const marketFetchedAt = usdtMarket?.fetchedAt ?? null;
  const sourceFresh = !!usdtMarket && !!usdtPrice && freshTimestamp(marketFetchedAt, now);

  return holdings.map((holding) => {
    if (holding.origin === "SIMULATED") return holding;

    if (holding.origin === "NILE_LIVE") {
      return {
        ...holding,
        valuation: unavailableValuation(
          holding,
          null,
          false,
          "Nile execution balances are excluded from the hypothetical Mainnet planning portfolio."
        ),
      };
    }

    const assetCandidates = liveMarkets.filter((market) => market.asset === holding.asset);
    const assetMarket = assetCandidates.length === 1 ? assetCandidates[0] : null;
    const assetPrice = parsePositiveDecimal(assetMarket?.underlyingPriceInTrx);
    const fetchedAt = assetMarket?.fetchedAt ?? marketFetchedAt;
    const stale = !freshTimestamp(fetchedAt, now) || !sourceFresh;

    if (!sourceFresh || !assetMarket || !assetPrice || assetMarket.fetchedAt !== marketFetchedAt) {
      const reason = stale
        ? "Live valuation unavailable because the JustLend price snapshot is missing, invalid, or stale."
        : !assetMarket
          ? `No unique active JustLend market price is available for ${holding.asset}.`
          : "The asset price and USDT conversion price are not from the same market snapshot.";
      return {
        ...holding,
        origin: "USER_DECLARED" as const,
        valuation: unavailableValuation(holding, fetchedAt, stale, reason),
      };
    }

    const amount = parsePositiveDecimal(holding.amount);
    if (!amount) {
      return {
        ...holding,
        origin: "USER_DECLARED" as const,
        valuation: unavailableValuation(
          holding,
          fetchedAt,
          false,
          "The declared asset amount is invalid."
        ),
      };
    }

    const value = amount.times(assetPrice).div(usdtPrice);
    if (!value.isFinite() || value.isNegative()) {
      return {
        ...holding,
        origin: "USER_DECLARED" as const,
        valuation: unavailableValuation(
          holding,
          fetchedAt,
          false,
          "The live price conversion produced an invalid value."
        ),
      };
    }

    return {
      ...holding,
      origin: "USER_DECLARED" as const,
      valuation: {
        asset: holding.asset,
        amount: holding.amount,
        value: value.toString(),
        denomination: "USDT" as const,
        source: JUSTLEND_VALUATION_SOURCE,
        fetchedAt,
        reality: "LIVE_MAINNET" as const,
        derivation: `${holding.amount} ${holding.asset} × ${assetPrice.toString()} TRX/${holding.asset} ÷ ${usdtPrice.toString()} TRX/USDT = ${value.toString()} USDT-equivalent`,
        stale: false,
      },
    };
  });
}

function decimalOrNull(value: string): Decimal | null {
  if (!value.trim()) return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

export function getHoldingValue(holding: Holding, now: number = Date.now()): string | null {
  const amount = decimalOrNull(holding.amount);
  if (!amount || amount.isNegative()) return null;
  if (amount.isZero()) return "0";

  const valuation = holding.valuation;
  const value = valuation?.value ? decimalOrNull(valuation.value) : null;
  if (
    !valuation ||
    !value ||
    !value.gt(0) ||
    valuation.asset !== holding.asset ||
    valuation.amount !== holding.amount ||
    valuation.denomination !== "USDT" ||
    !valuation.source.trim() ||
    (valuation.reality === "LIVE_MAINNET" && valuation.source !== JUSTLEND_VALUATION_SOURCE)
  ) return null;

  if (valuation.reality === "SIMULATED") return value.toString();
  if (
    valuation.reality !== "LIVE_MAINNET" ||
    valuation.stale ||
    !freshTimestamp(valuation.fetchedAt, now)
  ) return null;

  return value.toString();
}

export function hasCompleteValuation(profile: NeedsProfile, now: number = Date.now()): boolean {
  return profile.holdings.length > 0 && !(profile.missingFields?.length) && profile.holdings.every(
    (holding) => getHoldingValue(holding, now) !== null
  );
}

export function getPortfolioValue(profile: NeedsProfile, now: number = Date.now()): string | null {
  if (!hasCompleteValuation(profile, now)) return null;
  return profile.holdings.reduce(
    (total, holding) => total.plus(toDecimal(getHoldingValue(holding, now)!)),
    toDecimal(0)
  ).toFixed(2);
}

export function getValuationStatus(
  profile: NeedsProfile,
  now: number = Date.now()
): "SOURCE_BACKED" | "SNAPSHOT" | "SIMULATED" | "UNAVAILABLE" {
  if (!hasCompleteValuation(profile, now)) return "UNAVAILABLE";
  if (profile.holdings.some((holding) => holding.valuation?.reality === "SIMULATED")) {
    return "SIMULATED";
  }
  if (profile.holdings.some((holding) => holding.valuation?.reality === "SNAPSHOT")) {
    return "SNAPSHOT";
  }
  return "SOURCE_BACKED";
}

export function hasFreshMainnetValuation(
  profile: NeedsProfile,
  now: number,
  freshnessMs: number = VALUATION_FRESHNESS_MS
): boolean {
  if (!hasCompleteValuation(profile, now)) return false;
  return profile.holdings.every((holding) => {
    const valuation = holding.valuation;
    if (holding.amount === "0") return true;
    const fetchedAt = valuation?.fetchedAt ? Date.parse(valuation.fetchedAt) : Number.NaN;
    return valuation?.reality === "LIVE_MAINNET" &&
      valuation.denomination === "USDT" &&
      valuation.stale === false &&
      Number.isFinite(fetchedAt) &&
      fetchedAt <= now &&
      now - fetchedAt <= freshnessMs;
  });
}

export function getHoldingValuePerUnit(holding: Holding, now: number = Date.now()): Decimal | null {
  const amount = decimalOrNull(holding.amount);
  const value = getHoldingValue(holding, now);
  if (!amount || !amount.gt(0) || value === null) return null;
  return toDecimal(value).div(holding.amount);
}
