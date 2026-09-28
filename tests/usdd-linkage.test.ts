import { describe, it, expect } from "vitest";
import { evaluateUsddDecisionSignal } from "../src/domain/allocation/usdd-signals";
import { generateAllocationPlans } from "../src/domain/allocation/engine";
import { NeedsProfile, YieldOpportunity } from "../src/domain/allocation/types";
import { normalizeJustLendMarketList } from "../src/lib/integrations/justlend/normalize";
import { JUSTLEND_FALLBACK_FIXTURE } from "../src/lib/integrations/justlend/fixture";
import { RawJustLendToken } from "../src/lib/integrations/justlend/schemas";
import { UsddProtocolEvidence } from "../src/lib/integrations/usdd/client";

const sampleOpportunities: YieldOpportunity[] = normalizeJustLendMarketList(
  JUSTLEND_FALLBACK_FIXTURE.data.tokenList as RawJustLendToken[]
);

describe("USDD Evidence & Decision Linkage Engine", () => {
  const sampleProfile: NeedsProfile = {
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

  const createUsddEvidence = (collateralRatio: string, isFallback: boolean = false): UsddProtocolEvidence => ({
    totalSupplyUsd: "740000000",
    totalCollateralUsd: "1350000000",
    collateralRatioPct: `${collateralRatio}%`,
    earnTvlUsd: "50000000",
    psmStatus: "NORMAL",
    vaults: [
      {
        vaultType: "TRX",
        lockedValueUsd: "750000000",
        mintedUsdd: "350000000",
        collateralRatio: "214%",
      },
      {
        vaultType: "BTC",
        lockedValueUsd: "600000000",
        mintedUsdd: "390000000",
        collateralRatio: "153%",
      },
    ],
    source: isFallback ? "fallback" : "live",
    fetchedAt: new Date().toISOString(),
  });

  it("classifies collateral ratio >= 130% as HEALTHY and allows USDD in both safe and yield plans", () => {
    const evidence = createUsddEvidence("182.4");
    const signal = evaluateUsddDecisionSignal(evidence);

    expect(signal.riskClass).toBe("HEALTHY");
    expect(signal.thresholdProvenance).toBe("COMPASS_POLICY");
    expect(signal.eligibleForConservativePlan).toBe(true);
    expect(signal.eligibleForYieldPlan).toBe(true);

    const { plans } = generateAllocationPlans(sampleProfile, sampleOpportunities, undefined, evidence);
    const planAUsdd = plans[0].allocations.find((a) => a.asset === "USDD");
    const planBUsdd = plans[1].allocations.find((a) => a.asset === "USDD");

    expect(planAUsdd).toBeDefined();
    expect(planBUsdd).toBeDefined();
  });

  it("classifies collateral ratio between 110% and 120% as CAUTION and excludes USDD from Plan A (safe plan)", () => {
    const evidence = createUsddEvidence("115.0");
    const signal = evaluateUsddDecisionSignal(evidence);

    expect(signal.riskClass).toBe("CAUTION");
    expect(signal.thresholdProvenance).toBe("COMPASS_POLICY");
    expect(signal.eligibleForConservativePlan).toBe(false);
    expect(signal.eligibleForYieldPlan).toBe(true);

    const { plans } = generateAllocationPlans(sampleProfile, sampleOpportunities, undefined, evidence);
    const planAUsdd = plans[0].allocations.find((a) => a.asset === "USDD");
    const planBUsdd = plans[1].allocations.find((a) => a.asset === "USDD");

    // Plan A (conservative) must NOT contain USDD when under caution
    expect(planAUsdd).toBeUndefined();
    // Plan B may still evaluate it with caution
    expect(planBUsdd).toBeDefined();
  });

  it("classifies collateral ratio < 110% as CRITICAL and completely blocks USDD allocation in all plans", () => {
    const evidence = createUsddEvidence("104.5");
    const signal = evaluateUsddDecisionSignal(evidence);

    expect(signal.riskClass).toBe("CRITICAL");
    expect(signal.eligibleForConservativePlan).toBe(false);
    expect(signal.eligibleForYieldPlan).toBe(false);

    const { plans } = generateAllocationPlans(sampleProfile, sampleOpportunities, undefined, evidence);
    const planAUsdd = plans[0].allocations.find((a) => a.asset === "USDD");
    const planBUsdd = plans[1].allocations.find((a) => a.asset === "USDD");

    expect(planAUsdd).toBeUndefined();
    expect(planBUsdd).toBeUndefined();
    expect(plans[0].deterministicReasons.some((r) => r.includes("USDD"))).toBe(true);
  });

  it("applies safe conservative fallback when USDD evidence is missing or flagged as stale", () => {
    // Stale fallback evidence
    const staleEvidence = createUsddEvidence("130.0", true);
    const signal = evaluateUsddDecisionSignal(staleEvidence);

    expect(signal.isFallback).toBe(true);
    expect(signal.riskClass).toBe("CAUTION"); // Stale data defaults to conservative CAUTION
    expect(signal.eligibleForConservativePlan).toBe(false);
    expect(signal.eligibleForYieldPlan).toBe(false);

    // Missing evidence entirely
    const missingSignal = evaluateUsddDecisionSignal(null);
    expect(missingSignal.riskClass).toBe("CAUTION");
    expect(missingSignal.collateralRatioPct).toBeNull();
    expect(missingSignal.eligibleForYieldPlan).toBe(false);
    expect(missingSignal.eligibleForConservativePlan).toBe(false);
  });
});
