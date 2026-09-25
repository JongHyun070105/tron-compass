export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type Goal = "LIQUIDITY" | "BALANCED" | "YIELD";

export type ExecutabilityClass =
  | "NILE_EXECUTABLE"
  | "LIVE_DATA_ONLY"
  | "SIMULATABLE"
  | "UNSUPPORTED_FOR_EXECUTION";

export interface Holding {
  asset: string;
  amount: string; // Decimal-safe string
  estimatedUsd?: string;
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
  incentiveApy: string; // e.g. "0.02" for 2.0%
  totalApy: string;

  tvlUsd: string;
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
  fetchedAt: string;

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
  incentiveApy: string;
  totalApy: string;

  baseYieldEstimateUsd: string;
  incentiveYieldEstimateUsd: string;
  estimatedCostUsd: string;
  netYieldEstimateUsd: string;

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
}

export interface AllocationPlan {
  id: string;
  label: string; // e.g. "Plan A (Liquidity-First)" | "Plan B (Yield-Oriented)"
  strategyType: "LIQUIDITY_FIRST" | "YIELD_ORIENTED" | "BALANCED";
  description: string;

  createdAt: string;
  horizonDays: number;

  totalCapitalUsd: string;
  liquidReserveUsd: string;
  liquidReservePct: string;

  allocations: AllocationLeg[];

  expectedBaseYieldUsd: string;
  expectedIncentiveYieldUsd: string;
  estimatedTotalCostUsd: string;
  expectedNetYieldUsd: string;
  effectiveNetApy: string;

  liquidityScore: number; // 1-100
  riskScore: number; // 1-100

  risks: string[];
  exitConditions: string[];
  assumptions: string[];
  deterministicReasons: string[];
  sourceSnapshotIds: string[];

  constraintChecks: ConstraintCheckResult[];
}
