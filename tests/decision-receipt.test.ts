import { describe, expect, it } from "vitest";
import * as receipt from "../src/domain/decision/receipt";

const draft = {
  id: "receipt-1",
  parentId: null,
  createdAt: "2026-09-28T00:00:00.000Z",
  rules: { version: 1, items: [] },
  needsConfirmedAt: "2026-09-27T23:00:00.000Z",
  evidence: [],
  screening: { included: [], excluded: [] },
  alternatives: [],
  assumptions: [],
  selection: { planId: "plan-a", selectedAt: "2026-09-28T00:00:00.000Z" },
  approval: { shown: null, signer: null, approvedAt: null },
};

describe("Decision Receipt", () => {
  it("creates a deterministic pre-execution integrity hash that excludes transaction data", async () => {
    expect(typeof (receipt as any).createDecisionReceipt).toBe("function");
    const created = await (receipt as any).createDecisionReceipt(draft);
    const txEnriched = {
      ...created,
      execution: { ...created.execution, txHash: "a".repeat(64), blockNumber: 42 },
    };

    expect(created.integrity.decisionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await (receipt as any).verifyDecisionHash(txEnriched)).toBe(true);
  });

  it("rechecks a market-backed assumption from PASS to FAIL using frozen thresholds", () => {
    const assumptions = [{
      id: "A1",
      description: "Base supply APY remains at or above the recorded value",
      sourceField: "market.baseApy",
      predicate: "GTE",
      threshold: "0.01",
      thresholdProvenance: "MARKET_SNAPSHOT",
      status: "PASS",
      lastCheckedAt: "2026-09-28T00:00:00.000Z",
    }];
    const currentEvidence = [{
      id: "base-now",
      field: "market.baseApy",
      value: "0.002",
      source: "https://openapi.just.network/lend/jtoken",
      fetchedAt: "2026-09-28T00:10:00.000Z",
      terms: "variable supply APY",
      reality: "SIMULATED",
    }];

    expect((receipt as any).evaluateDecisionAssumptions(assumptions, currentEvidence, "2026-09-28T00:10:00.000Z")[0].status).toBe("FAIL");
  });

  it("links a proposal receipt to its parent decision", async () => {
    expect(typeof (receipt as any).createChildDecisionReceipt).toBe("function");
    const parent = await (receipt as any).createDecisionReceipt(draft);
    const child = await (receipt as any).createChildDecisionReceipt(parent, {
      ...draft,
      id: "receipt-1-1",
      createdAt: "2026-09-28T00:10:00.000Z",
    });

    expect(child.parentId).toBe(parent.id);
  });

  it("freezes evidence as SNAPSHOT while preserving USER_DECLARED and LIVE_MAINNET realities", () => {
    const evidence = (receipt as any).buildDecisionEvidence([], null, "2026-09-29T00:00:00.000Z", {
      holdings: [{
        asset: "TRX",
        amount: "10",
        origin: "USER_DECLARED",
        valuation: {
          asset: "TRX",
          amount: "10",
          value: "4",
          denomination: "USDT",
          source: "https://openapi.just.network/lend/jtoken",
          fetchedAt: "2026-09-29T00:00:00.000Z",
          reality: "LIVE_MAINNET",
          stale: false,
        },
      }, {
        asset: "jTRX",
        amount: "5",
        origin: "NILE_LIVE",
      }],
      horizonDays: 1,
      minimumLiquidUsdtEquivalent: "0",
      riskLevel: "LOW",
      maxVolatileExposurePct: "1",
      goal: "BALANCED",
      missingFields: [],
      assumptions: [],
    });
    const userInput = evidence.find((item: any) => item.field === "portfolio.holdings.TRX.origin");
    const nileInput = evidence.find((item: any) => item.field === "portfolio.holdings.jTRX.origin");
    const price = evidence.find((item: any) => item.field === "portfolio.holdings.TRX.usdtEquivalentValue");
    expect(userInput).toMatchObject({ reality: "SNAPSHOT", observedReality: "USER_DECLARED" });
    expect(nileInput).toMatchObject({ reality: "SNAPSHOT", observedReality: "NILE_LIVE" });
    expect(price).toMatchObject({ reality: "SNAPSHOT", observedReality: "LIVE_MAINNET", value: "4" });
  });
});
