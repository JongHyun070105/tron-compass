import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "../src/lib/ai/mock-provider";
import { ExtractedProfileSchema } from "../src/lib/ai/schemas";
import { extractGroundedHoldings } from "../src/lib/ai/grounding";

describe("AI Needs Analysis Layer", () => {
  const mock = new MockLLMProvider();

  it("extracts only explicitly stated holding quantities, horizon, and minimum liquidity", async () => {
    const userInput =
      "I have 1,000 USDD and some TRX. I want to invest for about 90 days, but at least $300 must remain liquid. I prefer low risk.";

    const res = await mock.extractNeeds({ userInput });

    expect(res.profile.horizonDays).toBe(90);
    expect(res.profile.minimumLiquidUsd).toBe("300");
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

  it("uses an explicit wallet read for token quantity and never assigns a USD value", () => {
    expect(extractGroundedHoldings("I want to invest my USDD", [
      { asset: "TRX", amount: "12.5" },
      { asset: "USDD", amount: "UNAVAILABLE" },
    ])).toEqual([{ asset: "TRX", amount: "12.5" }]);
    expect(extractGroundedHoldings("I have 1,500 USDD and some TRX")).toEqual([
      { asset: "USDD", amount: "1500" },
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
      minimumLiquidUsd: "150",
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
      minimumLiquidUsd: "300",
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
          totalCapitalUsd: "1000",
          liquidReserveUsd: "500",
          liquidReservePct: "50%",
          allocations: [],
          expectedBaseYieldUsd: "10",
          expectedIncentiveYieldUsd: "15",
          estimatedTotalCostUsd: "0.4",
          expectedNetYieldUsd: "24.6",
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
          totalCapitalUsd: "1000",
          liquidReserveUsd: "300",
          liquidReservePct: "30%",
          allocations: [],
          expectedBaseYieldUsd: "15",
          expectedIncentiveYieldUsd: "25",
          estimatedTotalCostUsd: "0.4",
          expectedNetYieldUsd: "39.6",
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
