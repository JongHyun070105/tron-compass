import { describe, expect, it } from "vitest";
import { buildExecutionEvidenceContext, executionRiskDirection, getPreSignExecutionEvidence } from "../src/domain/allocation/execution-context";
import { NeedsProfile, YieldOpportunity, AllocationPlan } from "../src/domain/allocation/types";
import { createDecisionReceipt, verifyDecisionHash } from "../src/domain/decision/receipt";

function market(id: string, asset: string, fetchedAt: string): YieldOpportunity {
  return {
    id,
    ecosystem: "JUSTLEND",
    protocol: "JustLend DAO",
    product: id,
    network: "MAINNET",
    asset,
    contractAddress: `contract-${id}`,
    underlyingDecimals: 6,
    baseApy: "0.01",
    incentiveApy: "0.02",
    totalApy: "0.03",
    incentiveFetchedAt: fetchedAt,
    incentiveReality: "LIVE_MAINNET",
    poolCapacitySourceUnits: "1000",
    liquidityClass: "HIGH",
    priceRiskClass: "LOW",
    protocolRiskClass: "LOW",
    lockupDays: 0,
    exitConditions: [],
    estimatedEntryCostUsdtEquivalent: "0",
    estimatedExitCostUsdtEquivalent: "0",
    executable: false,
    executabilityClass: "LIVE_DATA_ONLY",
    executabilityLabel: "Live data only",
    sourceName: "JustLend",
    sourceUrl: "https://openapi.just.network/lend/jtoken",
    fetchedAt,
    reality: "LIVE_MAINNET",
    evidenceTerms: "Live Mainnet market snapshot",
    assumptions: [],
    warnings: [],
  };
}

const profile: NeedsProfile = {
  holdings: [{ asset: "TRX", amount: "2000", origin: "SIMULATED" }],
  horizonDays: 90,
  minimumLiquidUsdtEquivalent: "300",
  riskLevel: "LOW",
  maxVolatileExposurePct: "0.2",
  goal: "BALANCED",
  missingFields: [],
  assumptions: [],
};

const plan = {
  allocations: [{ productId: "jtrx-market", asset: "TRX" }],
} as unknown as AllocationPlan;

describe("pre-sign execution evidence context", () => {
  it("builds live evidence from the newly refreshed result instead of the receipt snapshot", () => {
    const refreshedAt = "2026-09-29T01:00:00.000Z";
    const result = buildExecutionEvidenceContext({
      plan,
      profile,
      opportunities: [market("jtrx-market", "TRX", refreshedAt)],
      usddEvidence: null,
      now: Date.parse(refreshedAt),
    });

    expect(result.marketEvidence).toEqual([
      { fetchedAt: refreshedAt, reality: "LIVE_MAINNET" },
      { fetchedAt: refreshedAt, reality: "LIVE_MAINNET" },
    ]);
    expect(result.profile).not.toBe(profile);
    expect(result.liveEvidenceFetchedAt).toBe(refreshedAt);
  });

  it("keeps decision, live-evidence, and wallet timestamps as distinct values", () => {
    const receiptSnapshotAt = "2026-09-29T00:00:00.000Z";
    const liveEvidenceFetchedAt = "2026-09-29T01:00:00.000Z";
    const walletStateFetchedAt = "2026-09-29T01:00:03.000Z";
    const result = buildExecutionEvidenceContext({
      plan,
      profile,
      opportunities: [market("jtrx-market", "TRX", liveEvidenceFetchedAt)],
      usddEvidence: null,
      now: Date.parse(liveEvidenceFetchedAt),
    });
    const receipt = { createdAt: receiptSnapshotAt, evidence: [{ fetchedAt: "2026-09-29T00:00:00.000Z" }] };
    const wallet = { fetchedAt: walletStateFetchedAt };

    expect(new Set([receipt.createdAt, result.liveEvidenceFetchedAt, wallet.fetchedAt]).size).toBe(3);
    expect(receipt.evidence[0].fetchedAt).not.toBe(result.liveEvidenceFetchedAt);
  });

  it("keeps the Decision Receipt evidence frozen when a newer execution context is built", async () => {
    const snapshotAt = "2026-09-29T00:00:00.000Z";
    const liveAt = "2026-09-29T01:00:00.000Z";
    const receipt = await createDecisionReceipt({
      id: "frozen-snapshot",
      createdAt: snapshotAt,
      horizonDays: 90,
      rules: { version: 1, items: [] },
      needsConfirmedAt: null,
      evidence: [{
        id: "jtrx-base", field: "jtrx.baseApy", value: "0.01", source: "test",
        fetchedAt: snapshotAt, terms: null, reality: "SNAPSHOT", observedReality: "LIVE_MAINNET",
      }],
      screening: { included: [], excluded: [] },
      alternatives: [],
      assumptions: [],
      selection: { planId: "plan-a", selectedAt: snapshotAt },
      approval: { shown: null },
    });
    const refreshed = buildExecutionEvidenceContext({
      plan,
      profile,
      opportunities: [market("jtrx-market", "TRX", liveAt)],
      usddEvidence: null,
      now: Date.parse(liveAt),
    });

    expect(refreshed.liveEvidenceFetchedAt).toBe(liveAt);
    expect(receipt.createdAt).toBe(snapshotAt);
    expect(receipt.evidence[0].fetchedAt).toBe(snapshotAt);
    expect(await verifyDecisionHash(receipt)).toBe(true);
  });

  it("classifies Supply as exposure-increasing and Redeem as exposure-decreasing", () => {
    expect(executionRiskDirection("SUPPLY")).toBe("INCREASE_EXPOSURE");
    expect(executionRiskDirection("REDEEM")).toBe("DECREASE_EXPOSURE");
  });

  it("refreshes exactly once before a Supply gate and uses the returned evidence", async () => {
    const old = { opportunities: [market("jtrx-market", "TRX", "2026-09-29T00:00:00.000Z")], usddEvidence: null };
    const refreshed = { opportunities: [market("jtrx-market", "TRX", "2026-09-29T01:00:00.000Z")], usddEvidence: null };
    const order: string[] = [];
    let refreshCount = 0;
    const current = await getPreSignExecutionEvidence("SUPPLY", old, async () => {
      order.push("refresh");
      refreshCount += 1;
      return refreshed;
    });
    order.push("gate");
    const context = buildExecutionEvidenceContext({ plan, profile, ...current, now: Date.parse("2026-09-29T01:00:00.000Z") });

    expect(refreshCount).toBe(1);
    expect(order).toEqual(["refresh", "gate"]);
    expect(context.liveEvidenceFetchedAt).toBe("2026-09-29T01:00:00.000Z");
  });

  it("does not require a Mainnet refresh for risk-reducing Redeem", async () => {
    const current = { opportunities: [market("jtrx-market", "TRX", "2026-09-29T00:00:00.000Z")], usddEvidence: null };
    let refreshCount = 0;
    const result = await getPreSignExecutionEvidence("REDEEM", current, async () => {
      refreshCount += 1;
      throw new Error("must not refresh for an exit");
    });

    expect(refreshCount).toBe(0);
    expect(result).toBe(current);
  });
});
