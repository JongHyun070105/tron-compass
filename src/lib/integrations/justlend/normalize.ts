import { RawJustLendMiningApyResponse, RawJustLendToken } from "./schemas";
import { EvidenceReality, YieldOpportunity } from "@/domain/allocation/types";
import { JUSTLEND_NILE_CONTRACTS } from "./contracts";
import { SafeMath, toDecimal } from "@/lib/math/decimal";

const LEGACY_SYMBOLS = new Set([
  "jUSDCOLD",
  "jUSDDOLD",
  "jBUSDOLD",
  "jSUNOLD",
  "jUSDJ",
  "jWBTT",
]);

const MINING_APY_URL = "https://openapi.just.network/mining/apy";

export function normalizeJustLendToken(
  token: RawJustLendToken,
  timestamp: string | null = null,
  reality: EvidenceReality = "SNAPSHOT",
  miningApy?: RawJustLendMiningApyResponse["data"] | null,
  miningFetchedAt: string | null = null
): YieldOpportunity | null {
  // 1. Exclude legacy and paused markets
  if (LEGACY_SYMBOLS.has(token.symbol) || token.symbol.endsWith("OLD")) {
    return null;
  }

  const baseRate = toDecimal(token.supplyRate);
  // If base APY is negative or completely zero with no TVL, skip
  if (baseRate.isNegative()) {
    return null;
  }

  const asset = token.underlyingSymbol || token.symbol.replace(/^j/, "");

  // Risk categorization
  let priceRiskClass: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
  let liquidityClass: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
  const protocolRiskClass: "LOW" | "MEDIUM" | "HIGH" = "LOW";

  if (["USDD", "USDT", "USD1", "TUSD"].includes(asset)) {
    priceRiskClass = "LOW";
    liquidityClass = "HIGH";
  } else if (["TRX", "sTRX"].includes(asset)) {
    priceRiskClass = "MEDIUM";
    liquidityClass = "HIGH";
  } else {
    priceRiskClass = "HIGH";
    liquidityClass = "MEDIUM";
  }

  // Base APY from market supplyRate
  const baseApy = baseRate.toFixed(6);

  // The documented USDD mining APY feed is separate from /lend/jtoken. A
  // successful feed treats an omitted market key as no active mining; without
  // a successfully parsed feed, incentive and combined APY remain unknown.
  const rawIncentiveApy = miningApy === undefined || miningApy === null
    ? null
    : miningApy[token.address]?.USDD ?? "0";
  const incentiveApy = rawIncentiveApy === null
    ? null
    : toDecimal(rawIncentiveApy).toFixed(6);
  const totalApy = incentiveApy === null
    ? null
    : SafeMath.add(baseApy, incentiveApy).toFixed(6);

  // Nile execution capability check
  // jTRX is verified and active on Nile testnet
  const isNileSupported = token.symbol === "jTRX";
  const nileAddress = isNileSupported
    ? JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58
    : undefined;

  // TVL calculation: cash + totalBorrows (rough estimate in underlying)
  const tvlUnderlying = SafeMath.add(token.cash, token.totalBorrows).toString();

  return {
    id: `justlend-${token.symbol.toLowerCase()}`,
    ecosystem: "JUSTLEND",
    protocol: "JustLend DAO",
    product: `${token.symbol} Lending Market`,
    network: "MAINNET",
    asset,
    contractAddress: token.address,
    underlyingAddress: token.underlyingAddress,
    underlyingDecimals: token.underlyingDecimal,

    baseApy,
    incentiveApy,
    totalApy,
    incentiveSourceName: "JustLend OpenAPI (/mining/apy)",
    incentiveSourceUrl: MINING_APY_URL,
    incentiveFetchedAt: miningApy === undefined || miningApy === null ? null : miningFetchedAt,
    incentiveReality: miningApy === undefined || miningApy === null ? null : reality,
    incentiveEvidenceTerms: incentiveApy === null
      ? "The separate USDD mining APY feed was unavailable for this observation; incentive return and combined APY are unknown."
      : "Annualized USDD mining APY from the address-keyed /mining/apy feed. JustLend defines total supply APY as base supplyRate + mining APY; zero or omitted market entries indicate no active mining.",

    poolCapacitySourceUnits: tvlUnderlying,
    utilizationPct: toDecimal(token.totalBorrows).gt(0)
      ? SafeMath.div(
          token.totalBorrows,
          SafeMath.add(token.cash, token.totalBorrows)
        ).toFixed(4)
      : "0",

    liquidityClass,
    priceRiskClass,
    protocolRiskClass,

    lockupDays: 0, // No lockup, on-demand redemption
    exitConditions: [
      "Instant redemption available subject to market utilization pool liquidity",
      "Redemption consumes TRON Energy/Bandwidth or burns TRX for resources",
    ],

    estimatedEntryCostUsd: "0.20", // Compass policy estimate; not an observed chain fee.
    estimatedExitCostUsd: "0.20",

    executable: isNileSupported,
    executabilityClass: isNileSupported ? "NILE_EXECUTABLE" : "LIVE_DATA_ONLY",
    executabilityLabel: isNileSupported
      ? "실행 가능 (Nile에서 직접 테스트 가능)"
      : "분석 전용 (Mainnet 시장 데이터 기반)",
    executionNetwork: isNileSupported ? "NILE" : null,
    nileContractAddress: nileAddress,

    sourceName: "JustLend OpenAPI (lend/jtoken)",
    sourceUrl: "https://openapi.just.network/lend/jtoken",
    fetchedAt: timestamp,
    reality,
    evidenceTerms: "Base supply APY from the JustLend supplyRate field; variable by market utilization. USDD mining APY is read separately from the address-keyed /mining/apy feed.",

    assumptions: [
      "Supply APY is variable and adjusts per block based on market borrowing utilization",
      "Incentive yield is provided via ecosystem reward pools and subject to DAO governance",
    ],
    warnings: isNileSupported
      ? []
      : ["This market is monitored on Mainnet for yield analysis; sandbox execution available on Nile for jTRX."],
  };
}

export function normalizeJustLendMarketList(
  tokens: RawJustLendToken[],
  timestamp: string | null = null,
  reality: EvidenceReality = "SNAPSHOT",
  miningApy?: RawJustLendMiningApyResponse["data"] | null,
  miningFetchedAt: string | null = null
): YieldOpportunity[] {
  return tokens
    .map((t) => normalizeJustLendToken(t, timestamp, reality, miningApy, miningFetchedAt))
    .filter((opp): opp is YieldOpportunity => opp !== null);
}
