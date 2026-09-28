export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type Goal = "LIQUIDITY" | "BALANCED" | "YIELD";

export type ExecutabilityClass =
  | "NILE_EXECUTABLE"
  | "LIVE_DATA_ONLY"
  | "SIMULATABLE"
  | "UNSUPPORTED_FOR_EXECUTION";

export type EvidenceReality = "LIVE_MAINNET" | "NILE_LIVE" | "SNAPSHOT" | "SIMULATED";

export interface HoldingUsdValuation {
  valueUsd: string;
  source: string;
  fetchedAt: string | null;
  reality: EvidenceReality;
  terms?: string;
}

export type InvestmentRuleType =
  | "MINIMUM_LIQUIDITY"
  | "MAX_VOLATILE_EXPOSURE"
  | "EXCLUDED_ASSET";

export interface InvestmentRule {
  id: string;
  version: number;
  type: InvestmentRuleType;
  predicate: "GTE" | "LTE" | "NOT_IN";
  value: string;
  sourceQuote?: string | null;
  confirmedAt: string;
  effectiveUntil?: string | null;
}

export interface Holding {
  asset: string;
  amount: string; // Decimal-safe string
  usdValuation?: HoldingUsdValuation;
}

export interface NeedsProfile {
  holdings: Holding[];
  horizonDays: number;
  minimumLiquidUsd: string;
  riskLevel: RiskLevel;
  maxVolatileExposurePct: string;
  goal: Goal;

  allowedAssets?: string[];
  excludedAssets?: string[];

  protectionClause?: string; // e.g. "여행비 $300은 운용 대상에서 제외"
  missingFields: string[];
  assumptions: string[];
  sourceQuote?: string | null;
  investmentRules?: InvestmentRule[];
}

export interface YieldOpportunity {
  id: string;

  ecosystem: "JUSTLEND" | "USDD";
  protocol: string;
  product: string;

  network: "MAINNET" | "NILE";
  asset: string;
  contractAddress: string;
  underlyingAddress?: string;
  underlyingDecimals: number;

  baseApy: string; // e.g. "0.035" for 3.5%
  incentiveApy: string | null; // null means no source-backed reward value is available
  totalApy: string | null; // null when incentive reward data is unavailable
  incentiveSourceName?: string;
  incentiveSourceUrl?: string;
  incentiveFetchedAt?: string | null;
  incentiveReality?: EvidenceReality | null;
  incentiveEvidenceTerms?: string;

  poolCapacitySourceUnits: string;
  utilizationPct?: string;

  liquidityClass: "HIGH" | "MEDIUM" | "LOW";
  priceRiskClass: "LOW" | "MEDIUM" | "HIGH";
  protocolRiskClass: "LOW" | "MEDIUM" | "HIGH";

  lockupDays: number;
  exitConditions: string[];

  estimatedEntryCostUsd: string;
  estimatedExitCostUsd: string;

  executable: boolean;
  executabilityClass: ExecutabilityClass;
  executabilityLabel: string;
  executionNetwork?: "NILE" | null;
  nileContractAddress?: string;

  sourceName: string;
  sourceUrl: string;
  fetchedAt: string | null;
  reality: EvidenceReality;
  evidenceTerms: string;

  assumptions: string[];
  warnings: string[];
}

export interface AllocationLeg {
  asset: string;
  productId: string;
  productName: string;
  protocol: string;
  amount: string;
  usdValue: string;
  allocationPct: string;

  baseApy: string;
  incentiveApy: string | null;
  totalApy: string | null;

  baseYieldEstimateUsd: string;
  incentiveYieldEstimateUsd: string | null;
  estimatedCostUsd: string;
  netYieldEstimateUsd: string | null;

  executable: boolean;
  executabilityClass: ExecutabilityClass;
  executabilityLabel: string;
  executionNetwork?: "NILE" | null;
  targetContract?: string;
}

export interface ConstraintCheckResult {
  key: string;
  name: string;
  passed: boolean;
  required: string;
  actual: string;
  detail: string;
  ruleId?: string;
  ruleVersion?: number;
}

export interface AllocationPlan {
  id: string;
  label: string; // e.g. "Plan A (Liquidity-First)" | "Plan B (Yield-Oriented)"
  strategyType: "LIQUIDITY_FIRST" | "YIELD_ORIENTED" | "BALANCED";
  description: string;

  createdAt: string;
  horizonDays: number;

  totalCapitalUsd: string;
  usdValuationStatus?: "SOURCE_BACKED" | "SNAPSHOT" | "SIMULATED" | "UNAVAILABLE";
  liquidReserveUsd: string;
  liquidReservePct: string;

  allocations: AllocationLeg[];

  expectedBaseYieldUsd: string;
  expectedIncentiveYieldUsd: string | null;
  estimatedTotalCostUsd: string;
  expectedNetYieldUsd: string | null;
  effectiveNetApy: string | null;

  liquidityScore: number; // 1-100
  riskScore: number; // 1-100

  risks: string[];
  exitConditions: string[];
  assumptions: string[];
  deterministicReasons: string[];
  sourceSnapshotIds: string[];

  constraintChecks: ConstraintCheckResult[];
}
