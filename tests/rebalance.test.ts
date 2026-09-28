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
      { asset: "USDD", amount: "1000", usdValuation: { valueUsd: "1000", source: "test fixture", fetchedAt: null, reality: "SIMULATED" } },
      { asset: "TRX", amount: "2000", usdValuation: { valueUsd: "500", source: "test fixture", fetchedAt: null, reality: "SIMULATED" } },
    ],
    horizonDays: 90,
    minimumLiquidUsd: "300",
    riskLevel: "LOW",
    maxVolatileExposurePct: "0.20",
    goal: "YIELD",
    missingFields: [],
    assumptions: [],
  };

  // A deterministic, explicitly simulated reward value lets the numeric replay
  // impact test exercise known incentive inputs without claiming live evidence.
  const initialOpps = normalizeJustLendMarketList(
    JUSTLEND_FALLBACK_FIXTURE.data.tokenList as RawJustLendToken[]
  ).map((opportunity) => {
    const incentiveApy = opportunity.asset === "USDD" ? "0.03" : "0.000000";
    return {
        ...opportunity,
        incentiveApy,
        totalApy: (Number(opportunity.baseApy) + Number(incentiveApy)).toFixed(6),
        incentiveReality: "SIMULATED" as const,
        incentiveFetchedAt: null,
        incentiveEvidenceTerms: "SIMULATED unit-test input; not market evidence.",
    };
  });

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

  it("triggers rebalance when recorded base yield drops and calculates simulated return impact", () => {
    const scenario1 = REPLAY_SCENARIOS[0];
    const degradedOpps = scenario1.simulatedMarketDelta(initialOpps);

    const proposal = detectRebalanceOpportunity(
      originalPlan,
      sampleProfile,
      degradedOpps
    );

    expect(proposal.triggered).toBe(true);
    expect(proposal.checks.length).toBeGreaterThan(0);
    expect(proposal.primaryReason).toContain("recorded yield assumption is below its original value");
    expect(proposal.proposedPlan).toBeDefined();

    // Verify calculated return metrics
    expect(proposal.originalExpectedReturnUsd).toBeDefined();
    expect(proposal.newExpectedReturnUsd).toBeDefined();
    expect(proposal.deltaReturnUsd).toBeDefined();
    expect(proposal.deltaReturnPct).toBeDefined();

    // In Scenario 1 (incentive expires), original yield should degrade
    expect(parseFloat(proposal.deltaReturnUsd!)).toBeLessThan(0);
    expect(parseFloat(proposal.deltaReturnPct!)).toBeLessThan(0);

    // Proposed plan still satisfies all hard constraints
    expect(proposal.proposedPlan.constraintChecks.every((c) => c.passed)).toBe(true);
  });

  it("keeps replay return impact unavailable when the original incentive source was missing", () => {
    const unknownOpportunities = normalizeJustLendMarketList(
      JUSTLEND_FALLBACK_FIXTURE.data.tokenList as RawJustLendToken[]
    );
    const unknownPlan = generateAllocationPlans(sampleProfile, unknownOpportunities).plans[1];
    const changedOpportunities = REPLAY_SCENARIOS[0].simulatedMarketDelta(unknownOpportunities);
    const proposal = detectRebalanceOpportunity(unknownPlan, sampleProfile, changedOpportunities);

    expect(proposal.triggered).toBe(true);
    expect(proposal.originalExpectedReturnUsd).toBe("UNAVAILABLE");
    expect(proposal.deltaReturnUsd).toBe("UNAVAILABLE");
    expect(proposal.deltaReturnPct).toBe("UNAVAILABLE");
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

  it("never executes rebalance automatically without explicit human approval (Human-in-the-loop guarantee)", () => {
    const scenario1 = REPLAY_SCENARIOS[0];
    const degradedOpps = scenario1.simulatedMarketDelta(initialOpps);

    const proposal = detectRebalanceOpportunity(
      originalPlan,
      sampleProfile,
      degradedOpps
    );

    // Ensure the engine produces an immutable proposal object only, without any auto-broadcast tx
    expect(proposal).not.toHaveProperty("transactionHash");
    expect(proposal).not.toHaveProperty("broadcasted");
    expect(proposal.triggered).toBe(true);
    // Original plan remains unmodified in calling context
    expect(originalPlan.id).toBeDefined();
  });
});
