import { describe, it, expect } from "vitest";
import { generateAllocationPlans } from "../src/domain/allocation/engine";
import { normalizeJustLendMarketList } from "../src/lib/integrations/justlend/normalize";
import { JUSTLEND_FALLBACK_FIXTURE } from "../src/lib/integrations/justlend/fixture";
import { RawJustLendToken } from "../src/lib/integrations/justlend/schemas";
import { REPLAY_SCENARIOS } from "../src/domain/monitoring/replay-scenarios";
import { detectRebalanceOpportunity } from "../src/domain/monitoring/rebalance-engine";
import { NeedsProfile } from "../src/domain/allocation/types";

describe("Historical Replay & Rebalance Engine", () => {
  const sampleProfile: NeedsProfile = {
    holdings: [
      { asset: "USDD", amount: "1000", estimatedUsd: "1000" },
      { asset: "TRX", amount: "2000", estimatedUsd: "500" },
    ],
    horizonDays: 90,
    minimumLiquidUsd: "300",
    riskLevel: "LOW",
    maxVolatileExposurePct: "0.20",
    goal: "YIELD",
    missingFields: [],
    assumptions: [],
  };

  const initialOpps = normalizeJustLendMarketList(
    JUSTLEND_FALLBACK_FIXTURE.data.tokenList as RawJustLendToken[]
  );

  const { plans } = generateAllocationPlans(sampleProfile, initialOpps);
  const originalPlan = plans[1]; // Plan B (Yield-oriented, holds jUSDD with incentive)

  it("does not trigger rebalance when market conditions remain stable", () => {
    const proposal = detectRebalanceOpportunity(
      originalPlan,
      sampleProfile,
      initialOpps
    );
    expect(proposal.triggered).toBe(false);
  });

  it("triggers rebalance when mining incentive expires in Replay Scenario 1", () => {
    const scenario1 = REPLAY_SCENARIOS[0];
    const degradedOpps = scenario1.simulatedMarketDelta(initialOpps);

    const proposal = detectRebalanceOpportunity(
      originalPlan,
      sampleProfile,
      degradedOpps
    );

    expect(proposal.triggered).toBe(true);
    expect(proposal.checks.length).toBeGreaterThan(0);
    expect(proposal.primaryReason).toContain("APY significantly decayed");
    expect(proposal.proposedPlan).toBeDefined();
    // Proposed plan still satisfies all hard constraints
    expect(proposal.proposedPlan.constraintChecks.every((c) => c.passed)).toBe(true);
  });

  it("triggers rebalance when liquid buffer falls below minimum requirement in Replay Scenario 2", () => {
    const proposal = detectRebalanceOpportunity(
      originalPlan,
      sampleProfile,
      initialOpps,
      "150.00" // Liquid reserve dropped to $150, below required $300!
    );

    expect(proposal.triggered).toBe(true);
    const liquidCheck = proposal.checks.find((c) =>
      c.reason.includes("minimum required reserve")
    );
    expect(liquidCheck).toBeDefined();
    expect(liquidCheck?.triggered).toBe(true);
  });
});
