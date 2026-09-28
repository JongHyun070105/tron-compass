import { describe, expect, it } from "vitest";
import { buildInvestmentRules, amendInvestmentRule, evaluateDecisionRules } from "../src/domain/allocation/rules";
import { NeedsProfile, AllocationLeg, YieldOpportunity } from "../src/domain/allocation/types";
import { generateAllocationPlans } from "../src/domain/allocation/engine";

const profile: NeedsProfile = {
  holdings: [{ asset: "TRX", amount: "10000", usdValuation: { valueUsd: "1000", source: "test fixture", fetchedAt: null, reality: "SIMULATED" } }],
  horizonDays: 90,
  minimumLiquidUsd: "100",
  riskLevel: "LOW",
  maxVolatileExposurePct: "0.20",
  goal: "BALANCED",
  missingFields: [],
  assumptions: [],
};

const opportunity: YieldOpportunity = {
  id: "jtrx",
  ecosystem: "JUSTLEND",
  protocol: "JustLend DAO",
  product: "jTRX",
  network: "MAINNET",
  asset: "TRX",
  contractAddress: "mainnet-contract",
  underlyingDecimals: 6,
  baseApy: "0.01",
  incentiveApy: null,
  totalApy: null,
  poolCapacitySourceUnits: "1000",
  liquidityClass: "HIGH",
  priceRiskClass: "MEDIUM",
  protocolRiskClass: "LOW",
  lockupDays: 0,
  exitConditions: [],
  estimatedEntryCostUsd: "0.20",
  estimatedExitCostUsd: "0.20",
  executable: true,
  executabilityClass: "NILE_EXECUTABLE",
  executabilityLabel: "Nile",
  executionNetwork: "NILE",
  nileContractAddress: "nile-contract",
  sourceName: "JustLend OpenAPI",
  sourceUrl: "https://openapi.just.network/lend/jtoken",
  fetchedAt: "2026-09-28T00:00:00.000Z",
  reality: "LIVE_MAINNET",
  evidenceTerms: "variable supply rate",
  assumptions: [],
  warnings: [],
};

const exposure38: AllocationLeg = {
  asset: "TRX",
  productId: "jtrx",
  productName: "jTRX",
  protocol: "JustLend DAO",
  amount: "1520",
  usdValue: "380",
  allocationPct: "0.38",
  baseApy: "0.01",
  incentiveApy: null,
  totalApy: null,
  baseYieldEstimateUsd: "0.95",
  incentiveYieldEstimateUsd: "0",
  estimatedCostUsd: "0.40",
  netYieldEstimateUsd: "0.55",
  executable: true,
  executabilityClass: "NILE_EXECUTABLE",
  executabilityLabel: "Nile",
  executionNetwork: "NILE",
  targetContract: "nile-contract",
};

describe("confirmed investment rules", () => {
  it("preserves the user's source quote when drafting enforceable rules", () => {
    const rules = buildInvestmentRules(profile, "Keep $300 for my trip next month.", "2026-09-28T00:00:00.000Z");
    expect(rules.find((rule) => rule.type === "MINIMUM_LIQUIDITY")?.sourceQuote).toBe("Keep $300 for my trip next month.");
  });

  it("increments a rule version only when an explicit amendment is confirmed", () => {
    const [rule] = buildInvestmentRules(profile, "Keep $300 liquid.", "2026-09-28T00:00:00.000Z");
    const amended = amendInvestmentRule(rule, {
      value: "350",
      sourceQuote: "I confirm the reserve is $350.",
      confirmedAt: "2026-09-28T00:01:00.000Z",
    });
    expect(amended.version).toBe(2);
    expect(amended.value).toBe("350");
  });

  it("applies the same confirmed maximum exposure rule to a pre-sign allocation", () => {
    const confirmedRules = buildInvestmentRules(profile, "Keep volatile exposure below 20%.", "2026-09-28T00:00:00.000Z");
    const result = evaluateDecisionRules({ ...profile, investmentRules: confirmedRules }, "1000", [exposure38], [opportunity]);
    const exposure = result.checks.find((check) => check.key === "MAX_VOLATILE_EXPOSURE");
    expect(result.passed).toBe(false);
    expect(exposure?.ruleId).toBe("R2");
    expect(exposure?.actual).toBe("38.00%");

    const planned = generateAllocationPlans({ ...profile, investmentRules: confirmedRules }, [opportunity]);
    expect(planned.plans[0].constraintChecks.find((check) => check.key === "MAX_VOLATILE_EXPOSURE")?.ruleId).toBe("R2");
  });
});
