import { YieldOpportunity } from "../allocation/types";
import { SafeMath, toDecimal } from "@/lib/math/decimal";

export interface ReplayScenario {
  id: string;
  title: string;
  badge: "SIMULATED REPLAY" | "HISTORICAL EVENT";
  timePassedDays: number;
  description: string;
  simulatedMarketDelta: (opportunities: YieldOpportunity[]) => YieldOpportunity[];
  expectedTriggerReason: string;
}

export const REPLAY_SCENARIOS: ReplayScenario[] = [
  {
    id: "scenario-incentive-expiry",
    title: "Scenario 1: Base yield falls by half (Day +30)",
    badge: "SIMULATED REPLAY",
    timePassedDays: 30,
    description:
      "SIMULATED: the recorded base supply APY for each market falls by half after 30 days. This is a replay input, not a market forecast.",
    simulatedMarketDelta: (opps: YieldOpportunity[]) => {
      return opps.map((o) => {
        const baseApy = toDecimal(o.baseApy).div(2).toFixed(6);
        return {
          ...o,
          baseApy,
          totalApy: o.incentiveApy === null
            ? null
            : SafeMath.add(baseApy, o.incentiveApy).toFixed(6),
          reality: "SIMULATED",
          incentiveReality: o.incentiveApy === null ? null : "SIMULATED",
          incentiveFetchedAt: null,
          incentiveEvidenceTerms: o.incentiveApy === null
            ? "SIMULATED replay; recorded incentive APY remains unavailable."
            : "SIMULATED replay using the recorded incentive APY without a new market observation.",
          warnings: [...o.warnings, "SIMULATED OUTCOME: base APY halved for this replay."],
        };
      });
    },
    expectedTriggerReason: "SIMULATED base APY deterioration",
  },
  {
    id: "scenario-liquidity-shortfall",
    title: "Scenario 2: Liquid reserve drops below My Rules",
    badge: "SIMULATED REPLAY",
    timePassedDays: 14,
    description:
      "SIMULATED: available liquid reserve falls below the confirmed user rule. This replay input is not a live balance observation.",
    simulatedMarketDelta: (opps: YieldOpportunity[]) => opps, // Market remains same, but user requirement triggers rebalance
    expectedTriggerReason: "Liquid Reserve Below Minimum Threshold",
  },
];
