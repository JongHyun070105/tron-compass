import { YieldOpportunity } from "../allocation/types";

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
    title: "Scenario 1: JustLend Mining Incentive Halving / Expiry (Day +30)",
    badge: "SIMULATED REPLAY",
    timePassedDays: 30,
    description:
      "30일 후 JustLend DAO 보조금 정책 변경으로 jUSDD의 채굴 인센티브(3.2%)가 조기 소멸하여 총 기대 수익률이 60% 이상 급감하는 시나리오입니다.",
    simulatedMarketDelta: (opps: YieldOpportunity[]) => {
      return opps.map((o) => {
        if (o.asset === "USDD") {
          return {
            ...o,
            incentiveApy: "0.000000",
            totalApy: o.baseApy, // Incentive dropped to 0!
            warnings: [
              "SIMULATED: Ecosystem mining rewards have ceased pursuant to DAO vote.",
            ],
          };
        }
        return o;
      });
    },
    expectedTriggerReason: "USDD Ecosystem Mining Incentive Expiration",
  },
  {
    id: "scenario-liquidity-shortfall",
    title: "Scenario 2: Emergency Withdrawal & Liquidity Reserve Shortfall",
    badge: "SIMULATED REPLAY",
    timePassedDays: 14,
    description:
      "긴급 출금 발생으로 지갑 내 가용 유동성이 사용자가 지정한 최소 안전 유동성($300) 미만으로 하락하여 즉각적인 포지션 회수가 필요한 시나리오입니다.",
    simulatedMarketDelta: (opps: YieldOpportunity[]) => opps, // Market remains same, but user requirement triggers rebalance
    expectedTriggerReason: "Liquid Reserve Below Minimum Threshold",
  },
];
