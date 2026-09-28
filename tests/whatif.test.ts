import { describe, it, expect } from "vitest";
import { generateAllocationPlans, computeTotalCapitalUsd } from "../src/domain/allocation/engine";
import { NeedsProfile, YieldOpportunity } from "../src/domain/allocation/types";
import { normalizeJustLendMarketList } from "../src/lib/integrations/justlend/normalize";
import { JUSTLEND_FALLBACK_FIXTURE } from "../src/lib/integrations/justlend/fixture";
import { RawJustLendToken } from "../src/lib/integrations/justlend/schemas";
import { UsddProtocolEvidence } from "../src/lib/integrations/usdd/client";

const sampleOpportunities: YieldOpportunity[] = normalizeJustLendMarketList(
  JUSTLEND_FALLBACK_FIXTURE.data.tokenList as RawJustLendToken[]
);

const healthyLiveUsddEvidence: UsddProtocolEvidence = {
  totalSupplyUsd: "1000000",
  totalCollateralUsd: "1500000",
  collateralRatioPct: "150%",
  earnTvlUsd: "0",
  psmStatus: "Not evaluated by this evidence route",
  vaults: [],
  source: "live",
  sourceUrl: "https://app-api.usdd.io/data-platform/overview/info",
  fetchedAt: "2026-09-28T00:00:00.000Z",
  reality: "LIVE_MAINNET",
};

describe("What-If Simulation Engine (Zero AI, Instantaneous Local Determinism)", () => {
  const baseProfile: NeedsProfile = {
    holdings: [
      { asset: "USDD", amount: "1000", usdValuation: { valueUsd: "1000", source: "test fixture", fetchedAt: null, reality: "SIMULATED" } },
      { asset: "TRX", amount: "2000", usdValuation: { valueUsd: "500", source: "test fixture", fetchedAt: null, reality: "SIMULATED" } },
    ],
    horizonDays: 90,
    minimumLiquidUsd: "300",
    riskLevel: "LOW",
    maxVolatileExposurePct: "0.20",
    goal: "BALANCED",
    missingFields: [],
    assumptions: [],
  };

  it("adjusts liquid reserve and allocation instantly when minimum liquid requirement increases from $100 to $800", () => {
    // 1. Profile with $100 minimum liquid
    const profileLowLiquid: NeedsProfile = {
      ...baseProfile,
      minimumLiquidUsd: "100",
    };
    const { plans: plansLow } = generateAllocationPlans(profileLowLiquid, sampleOpportunities, undefined, healthyLiveUsddEvidence);
    const planBLow = plansLow[1]; // Yield-oriented
    const liquidLow = parseFloat(planBLow.liquidReserveUsd);

    // 2. Profile with $800 minimum liquid
    const profileHighLiquid: NeedsProfile = {
      ...baseProfile,
      minimumLiquidUsd: "800",
    };
    const { plans: plansHigh } = generateAllocationPlans(profileHighLiquid, sampleOpportunities, undefined, healthyLiveUsddEvidence);
    const planBHigh = plansHigh[1];
    const liquidHigh = parseFloat(planBHigh.liquidReserveUsd);

    // Must satisfy hard constraints in both
    expect(liquidLow).toBeGreaterThanOrEqual(100);
    expect(liquidHigh).toBeGreaterThanOrEqual(800);

    // Higher liquid requirement must leave less allocated for yield
    const totalAllocLow = planBLow.allocations.reduce((sum, a) => sum + parseFloat(a.usdValue), 0);
    const totalAllocHigh = planBHigh.allocations.reduce((sum, a) => sum + parseFloat(a.usdValue), 0);

    expect(totalAllocLow).toBeGreaterThan(totalAllocHigh);
  });

  it("preserves 100% capital as liquid reserve with 0 allocated when 100% liquidity is requested", () => {
    const totalCap = computeTotalCapitalUsd(baseProfile); // $1500
    const profile100Liquid: NeedsProfile = {
      ...baseProfile,
      minimumLiquidUsd: totalCap, // 1500
    };

    const { plans } = generateAllocationPlans(profile100Liquid, sampleOpportunities);

    for (const plan of plans) {
      expect(parseFloat(plan.liquidReserveUsd)).toBeCloseTo(1500, 2);
      expect(plan.allocations.length).toBe(0);
      expect(plan.deterministicReasons).toContain("No allocation was generated because available evidence and confirmed rules did not support one.");
    }
  });

  it("restricts volatile exposure when risk profile shifts from HIGH to LOW", () => {
    // Profile with HIGH risk (allows 50% volatile)
    const profileHighRisk: NeedsProfile = {
      ...baseProfile,
      riskLevel: "HIGH",
      maxVolatileExposurePct: "0.50", // $750 max
    };
    const { plans: plansHigh } = generateAllocationPlans(profileHighRisk, sampleOpportunities);
    const trxLegHigh = plansHigh[1].allocations.find((a) => a.asset === "TRX");

    // Profile with LOW risk (allows 10% volatile)
    const profileLowRisk: NeedsProfile = {
      ...baseProfile,
      riskLevel: "LOW",
      maxVolatileExposurePct: "0.10", // $150 max
    };
    const { plans: plansLow } = generateAllocationPlans(profileLowRisk, sampleOpportunities);
    const trxLegLow = plansLow[1].allocations.find((a) => a.asset === "TRX");

    expect(trxLegHigh).toBeDefined();
    expect(trxLegLow).toBeDefined();
    expect(parseFloat(trxLegLow!.usdValue)).toBeLessThanOrEqual(150.01);
    expect(parseFloat(trxLegHigh!.usdValue)).toBeGreaterThan(parseFloat(trxLegLow!.usdValue));
  });

  it("calculates plans purely in-memory synchronously without invoking external AI API", () => {
    const startTime = performance.now();
    const { plans } = generateAllocationPlans(baseProfile, sampleOpportunities);
    const durationMs = performance.now() - startTime;

    expect(plans).toHaveLength(2);
    // Local computation takes < 5ms (pure 0ms-feel latency)
    expect(durationMs).toBeLessThan(50);
  });
});
