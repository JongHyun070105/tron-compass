import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "../src/lib/ai/mock-provider";
import { ExtractedProfileSchema } from "../src/lib/ai/schemas";
import { extractGroundedHoldings } from "../src/lib/ai/grounding";

describe("AI Needs Analysis Layer", () => {
  const mock = new MockLLMProvider();

  it("does not assume a USD reserve is an equivalent USDT reserve", async () => {
    const userInput =
      "I have 1,000 USDD and some TRX. I want to invest for about 90 days, but at least $300 must remain liquid. I prefer low risk.";

    const res = await mock.extractNeeds({ userInput });

    expect(res.profile.horizonDays).toBe(90);
    expect(res.profile.minimumLiquidUsdtEquivalent).toBe("0");
    expect(res.profile.missingFields).toContain("USDT-equivalent 유동성 목표");
    expect(res.followUpQuestion).toContain("USDT-equivalent");
    expect(res.profile.riskLevel).toBe("LOW");

    const usdd = res.profile.holdings.find((h) => h.asset === "USDD");
    expect(usdd?.amount).toBe("1000");

    const trx = res.profile.holdings.find((h) => h.asset === "TRX");
    expect(trx).toBeUndefined();

    expect(res.summary).toContain("1000 USDD");
  });

  it("does not infer or value a balance when the user mentions only an asset", async () => {
    const res = await mock.extractNeeds({ userInput: "I have some TRX." });
    expect(res.profile.holdings).toEqual([]);
    expect(res.profile.missingFields).toContain("보유 자산 수량");
    expect(res.followUpQuestion).toContain("수량");
  });

  it("keeps connected Nile wallet quantities out of hypothetical Mainnet planning", () => {
    expect(extractGroundedHoldings("I want to invest my USDD")).toEqual([]);
    expect(extractGroundedHoldings("I have 1,500 USDD and some TRX")).toEqual([
      { asset: "USDD", amount: "1500", origin: "USER_DECLARED" },
    ]);
    expect(extractGroundedHoldings("I have 12345678901234567890.123456789 TRX")).toEqual([
      { asset: "TRX", amount: "12345678901234567890.123456789", origin: "USER_DECLARED" },
    ]);
  });

  it("flags missing fields when critical parameters are omitted", async () => {
    const incompleteInput = "I want to invest some USDD safely.";

    const res = await mock.extractNeeds({ userInput: incompleteInput });
    expect(res.needsClarification).toBe(true);
    expect(res.followUpQuestion).toBeDefined();
    expect(res.profile.missingFields.length).toBeGreaterThan(0);
  });

  it("validates structured output schema correctly using Zod", () => {
    const validJson = {
      holdings: [{ asset: "USDD", amount: "500" }],
      horizonDays: 60,
      minimumLiquidUsdtEquivalent: "150",
      riskLevel: "LOW",
      maxVolatileExposurePct: "0.15",
      goal: "LIQUIDITY",
      missingFields: [],
      summary: "Sample plan summary",
    };

    const parsed = ExtractedProfileSchema.safeParse(validJson);
    expect(parsed.success).toBe(true);

    const invalidJson = {
      holdings: "not an array",
    };
    const invalidParsed = ExtractedProfileSchema.safeParse(invalidJson);
    expect(invalidParsed.success).toBe(false);
  });

  it("generates polite Korean explanations for plans", async () => {
    const sampleProfile = {
      holdings: [{ asset: "USDD", amount: "1000" }],
      horizonDays: 90,
      minimumLiquidUsdtEquivalent: "300",
      riskLevel: "LOW" as const,
      maxVolatileExposurePct: "0.20",
      goal: "BALANCED" as const,
      missingFields: [],
      assumptions: [],
    };

    const explanation = await mock.explainPlans({
      profile: sampleProfile,
      plans: [
        {
          id: "plan-a",
          label: "Plan A",
          strategyType: "LIQUIDITY_FIRST",
          description: "Desc A",
          createdAt: new Date().toISOString(),
          horizonDays: 90,
          totalCapitalUsdtEquivalent: "1000",
          liquidReserveUsdtEquivalent: "500",
          liquidReservePct: "50%",
          allocations: [],
          expectedBaseYieldUsdtEquivalent: "10",
          expectedIncentiveYieldUsdtEquivalent: "15",
          estimatedTotalCostUsdtEquivalent: "0.4",
          expectedNetYieldUsdtEquivalent: "24.6",
          effectiveNetApy: "4.9%",
          liquidityScore: 90,
          riskScore: 20,
          risks: [],
          exitConditions: [],
          assumptions: [],
          sourceSnapshotIds: [],
          constraintChecks: [],
          deterministicReasons: [],
        },
        {
          id: "plan-b",
          label: "Plan B",
          strategyType: "YIELD_ORIENTED",
          description: "Desc B",
          createdAt: new Date().toISOString(),
          horizonDays: 90,
          totalCapitalUsdtEquivalent: "1000",
          liquidReserveUsdtEquivalent: "300",
          liquidReservePct: "30%",
          allocations: [],
          expectedBaseYieldUsdtEquivalent: "15",
          expectedIncentiveYieldUsdtEquivalent: "25",
          estimatedTotalCostUsdtEquivalent: "0.4",
          expectedNetYieldUsdtEquivalent: "39.6",
          effectiveNetApy: "7.9%",
          liquidityScore: 70,
          riskScore: 35,
          risks: [],
          exitConditions: [],
          assumptions: [],
          sourceSnapshotIds: [],
          constraintChecks: [],
          deterministicReasons: [],
        },
      ],
    });

    expect(explanation.planAExplanation).toContain("Plan A");
    expect(explanation.planBExplanation).toContain("Plan B");
    expect(explanation.comparisonRecommendation.length).toBeGreaterThan(10);
  });
});
