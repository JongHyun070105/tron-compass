import { describe, it, expect } from "vitest";
import { generateAllocationPlans } from "../src/domain/allocation/engine";
import { evaluateHardConstraints } from "../src/domain/allocation/constraints";
import { NeedsProfile, YieldOpportunity } from "../src/domain/allocation/types";
import { normalizeJustLendMarketList } from "../src/lib/integrations/justlend/normalize";
import { JUSTLEND_FALLBACK_FIXTURE } from "../src/lib/integrations/justlend/fixture";
import { RawJustLendToken } from "../src/lib/integrations/justlend/schemas";

const sampleOpportunities: YieldOpportunity[] = normalizeJustLendMarketList(
  JUSTLEND_FALLBACK_FIXTURE.data.tokenList as RawJustLendToken[]
);

describe("Deterministic Allocation Engine", () => {
  const sampleProfile: NeedsProfile = {
    holdings: [
      { asset: "USDD", amount: "1000", usdValuation: { valueUsd: "1000", source: "test fixture", fetchedAt: null, reality: "SIMULATED" } },
      { asset: "TRX", amount: "2000", usdValuation: { valueUsd: "500", source: "test fixture", fetchedAt: null, reality: "SIMULATED" } }, // simulated valuation
    ],
    horizonDays: 90,
    minimumLiquidUsd: "400", // Needs $400 liquid out of $1500
    riskLevel: "LOW",
    maxVolatileExposurePct: "0.20", // Max 20% volatile ($300 max TRX)
    goal: "BALANCED",
    missingFields: [],
    assumptions: [],
  };

  it("generates 2 distinct viable plans (Plan A and Plan B) both satisfying hard constraints", () => {
    const { plans, totalCapitalUsd } = generateAllocationPlans(
      sampleProfile,
      sampleOpportunities
    );

    expect(totalCapitalUsd).toBe("1500.00");
    expect(plans).toHaveLength(2);

    const [planA, planB] = plans;
    expect(planA.strategyType).toBe("LIQUIDITY_FIRST");
    expect(planB.strategyType).toBe("YIELD_ORIENTED");

    // Both plans must pass all constraint checks
    for (const p of [planA, planB]) {
      for (const check of p.constraintChecks) {
        expect(check.passed).toBe(true);
      }
    }
  });

  it("blocks allocation and marks My Rules UNKNOWN when a holding lacks sourced USD valuation", () => {
    const profileWithoutValuation: NeedsProfile = {
      ...sampleProfile,
      holdings: [{ asset: "TRX", amount: "2000" }],
    };
    const { plans, totalCapitalUsd } = generateAllocationPlans(profileWithoutValuation, sampleOpportunities);

    expect(totalCapitalUsd).toBe("0.00");
    expect(plans.every((plan) => plan.allocations.length === 0)).toBe(true);
    expect(plans.every((plan) => plan.usdValuationStatus === "UNAVAILABLE")).toBe(true);
    expect(plans.every((plan) => plan.constraintChecks.find((check) => check.key === "USD_VALUATION_EVIDENCE")?.passed === false)).toBe(true);
  });

  it("strictly enforces minimum liquid reserve (>= $400)", () => {
    const { plans } = generateAllocationPlans(
      sampleProfile,
      sampleOpportunities
    );

    for (const p of plans) {
      expect(parseFloat(p.liquidReserveUsd)).toBeGreaterThanOrEqual(400);
      const minCheck = p.constraintChecks.find(
        (c) => c.key === "MIN_LIQUIDITY"
      );
      expect(minCheck?.passed).toBe(true);
    }
  });

  it("strictly enforces maximum volatile exposure (<= 20% of total capital)", () => {
    const { plans } = generateAllocationPlans(
      sampleProfile,
      sampleOpportunities
    );

    for (const p of plans) {
      const trxLeg = p.allocations.find((a) => a.asset === "TRX");
      if (trxLeg) {
        // TRX usdValue cannot exceed 20% of 1500 ($300)
        expect(parseFloat(trxLeg.usdValue)).toBeLessThanOrEqual(300.01);
      }
      const volCheck = p.constraintChecks.find(
        (c) => c.key === "MAX_VOLATILE_EXPOSURE"
      );
      expect(volCheck?.passed).toBe(true);
    }
  });

  it("separates base yield and incentive yield clearly", () => {
    const { plans } = generateAllocationPlans(
      sampleProfile,
      sampleOpportunities
    );

    for (const p of plans) {
      expect(parseFloat(p.expectedBaseYieldUsd)).toBeGreaterThanOrEqual(0);
      if (p.allocations.some((leg) => leg.incentiveApy === null)) {
        expect(p.expectedIncentiveYieldUsd).toBeNull();
        expect(p.expectedNetYieldUsd).toBeNull();
        expect(p.effectiveNetApy).toBeNull();
      } else {
        expect(Number(p.expectedIncentiveYieldUsd)).toBeGreaterThanOrEqual(0);
      }
      expect(parseFloat(p.estimatedTotalCostUsd)).toBeGreaterThanOrEqual(0);
    }
  });

  it("fails hard constraints if a plan manually violates minimum liquidity", () => {
    const badAllocations = [
      {
        asset: "USDD",
        productId: "justlend-jusdd",
        productName: "jUSDD Market",
        protocol: "JustLend DAO",
        amount: "1400",
        usdValue: "1400", // Leaves only $100 liquid, less than required $400!
        allocationPct: "0.9333",
        baseApy: "0.01",
        incentiveApy: "0.03",
        totalApy: "0.04",
        baseYieldEstimateUsd: "3.5",
        incentiveYieldEstimateUsd: "10.5",
        estimatedCostUsd: "0.4",
        netYieldEstimateUsd: "13.6",
        executable: false,
        executabilityClass: "LIVE_DATA_ONLY" as const,
        executabilityLabel: "분석 전용",
      },
    ];

    const evalResult = evaluateHardConstraints(
      sampleProfile,
      "1500.00",
      badAllocations,
      sampleOpportunities
    );

    expect(evalResult.passed).toBe(false);
    const minLiquidCheck = evalResult.checks.find(
      (c) => c.key === "MIN_LIQUIDITY"
    );
    expect(minLiquidCheck?.passed).toBe(false);
  });

  it("respects excluded assets rule", () => {
    const profileWithExclusion: NeedsProfile = {
      ...sampleProfile,
      excludedAssets: ["TRX"],
    };

    const { plans } = generateAllocationPlans(
      profileWithExclusion,
      sampleOpportunities
    );

    for (const p of plans) {
      const trxLeg = p.allocations.find((a) => a.asset === "TRX");
      expect(trxLeg).toBeUndefined();
    }
  });
});
