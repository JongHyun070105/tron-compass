import { ExtractedProfile } from "./schemas";
import { NeedsProfile, AllocationPlan } from "@/domain/allocation/types";

export interface LLMProvider {
  extractNeeds(input: {
    userInput: string;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
    walletHoldings?: Array<{ asset: string; amount: string }>;
  }): Promise<{
    profile: NeedsProfile;
    needsClarification: boolean;
    followUpQuestion?: string;
    summary: string;
  }>;

  explainPlans(input: {
    profile: NeedsProfile;
    plans: AllocationPlan[];
  }): Promise<{
    planAExplanation: string;
    planBExplanation: string;
    comparisonRecommendation: string;
  }>;

  explainRebalance(input: {
    originalPlan: AllocationPlan;
    triggerReason: string;
    currentMarketChange: string;
  }): Promise<{
    explanation: string;
    actionAdvice: string;
  }>;
}

export class MockLLMProvider implements LLMProvider {
  async extractNeeds(input: {
    userInput: string;
    walletHoldings?: Array<{ asset: string; amount: string }>;
  }): Promise<{
    profile: NeedsProfile;
    needsClarification: boolean;
    followUpQuestion?: string;
    summary: string;
  }> {
    const text = input.userInput.toLowerCase();

    // 1. Detect holdings
    const holdings: Array<{ asset: string; amount: string; estimatedUsd?: string }> = [];

    // Check for USDD
    const usddMatch = text.match(/([0-9,]+(?:\.[0-9]+)?)\s*(?:usdd|usd)/);
    if (usddMatch) {
      const amount = usddMatch[1].replace(/,/g, "");
      holdings.push({ asset: "USDD", amount, estimatedUsd: amount });
    } else if (input.walletHoldings?.some((h) => h.asset === "USDD")) {
      const w = input.walletHoldings.find((h) => h.asset === "USDD")!;
      holdings.push({ asset: "USDD", amount: w.amount, estimatedUsd: w.amount });
    } else {
      holdings.push({ asset: "USDD", amount: "1000", estimatedUsd: "1000" });
    }

    // Check for TRX
    const trxMatch = text.match(/([0-9,]+(?:\.[0-9]+)?)\s*(?:trx)/);
    if (trxMatch) {
      const amount = trxMatch[1].replace(/,/g, "");
      const usdVal = (parseFloat(amount) * 0.25).toFixed(2);
      holdings.push({ asset: "TRX", amount, estimatedUsd: usdVal });
    } else if (text.includes("trx") || input.walletHoldings?.some((h) => h.asset === "TRX")) {
      holdings.push({ asset: "TRX", amount: "2000", estimatedUsd: "500" });
    }

    // 2. Horizon
    let horizonDays = 90;
    const horizonMatch = text.match(/([0-9]+)\s*(?:day|days|일|개월|month|months)/);
    if (horizonMatch) {
      const num = parseInt(horizonMatch[1], 10);
      if (text.includes("month") || text.includes("개월")) {
        horizonDays = num * 30;
      } else {
        horizonDays = num;
      }
    }

    // 3. Minimum Liquid Reserve
    let minimumLiquidUsd = "300";
    const liquidMatch = text.match(/(?:liquid|유동성|reserve|남겨|보유)[\s\w$]*?([0-9,]+)/);
    if (liquidMatch) {
      minimumLiquidUsd = liquidMatch[1].replace(/,/g, "");
    }

    // 4. Risk & Goal
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    let maxVolatileExposurePct = "0.20";
    let goal: "LIQUIDITY" | "BALANCED" | "YIELD" = "BALANCED";

    if (text.includes("high risk") || text.includes("수익") || text.includes("yield")) {
      riskLevel = "MEDIUM";
      maxVolatileExposurePct = "0.40";
      goal = "YIELD";
    } else if (text.includes("safe") || text.includes("low risk") || text.includes("안전") || text.includes("안정")) {
      riskLevel = "LOW";
      maxVolatileExposurePct = "0.15";
      goal = "LIQUIDITY";
    }

    const missingFields: string[] = [];
    if (!horizonMatch) {
      missingFields.push("투자기간 (예: 90일)");
    }

    const needsClarification = missingFields.length > 0;
    const followUpQuestion = needsClarification
      ? "희망하시는 목표 투자 기간(예: 30일, 90일, 180일)을 선택하시거나 말씀해 주시면 더욱 정밀한 수익률을 계산해 드립니다."
      : undefined;

    const summary = `총 ${holdings.map((h) => `${h.amount} ${h.asset}`).join(" 및 ")} 자산을 기반으로 ${horizonDays}일 동안 운용하며, 최소 $${minimumLiquidUsd}의 상시 유동성을 보존하는 ${riskLevel} 위험 수준의 플랜을 구성했습니다.`;

    const profile: NeedsProfile = {
      holdings,
      horizonDays,
      minimumLiquidUsd,
      riskLevel,
      maxVolatileExposurePct,
      goal,
      missingFields,
      assumptions: [
        `투자 기간 ${horizonDays}일 기준 복리 수익 추정`,
        `최소 유동성 $${minimumLiquidUsd} 확보 보장`,
      ],
    };

    return {
      profile,
      needsClarification,
      followUpQuestion,
      summary,
    };
  }

  async explainPlans(input: {
    profile: NeedsProfile;
    plans: AllocationPlan[];
  }): Promise<{
    planAExplanation: string;
    planBExplanation: string;
    comparisonRecommendation: string;
  }> {
    const [planA, planB] = input.plans;
    return {
      planAExplanation: `${planA?.label || "플랜 A"}는 요청하신 유동성 ($${input.profile.minimumLiquidUsd})을 초과하여 ${planA?.liquidReservePct || "50%"}의 자산을 즉시 인출 가능한 상태로 유지하며, 검증된 JustLend 코어 풀을 통해 원금 손실 위험을 최소화합니다.`,
      planBExplanation: `${planB?.label || "플랜 B"}는 하드 제약조건을 엄격히 준수하면서 남은 여유 자본을 USDD 생태계 인센티브 마이닝 및 jTRX 대출 풀에 최대 배분하여 예상 순수익을 극대화합니다.`,
      comparisonRecommendation: `단기 자금 인출 가능성이 있다면 유동성 방어 중심의 ${planA?.label}을, 약정 기간(${input.profile.horizonDays}일) 동안 안정적인 수익 누적을 원하신다면 ${planB?.label}을 추천합니다.`,
    };
  }

  async explainRebalance(input: {
    originalPlan: AllocationPlan;
    triggerReason: string;
    currentMarketChange: string;
  }): Promise<{
    explanation: string;
    actionAdvice: string;
  }> {
    return {
      explanation: `초기 계획 수립 시점 대비 ${input.triggerReason} 요인이 감지되었습니다. (${input.currentMarketChange}) 이로 인해 기존 플랜의 예상 기대 수익률이 하락하고 유동성 조건이 변경되었습니다.`,
      actionAdvice: `현재 수익률이 저하된 포지션을 안전하게 상환(Redeem)하고, 더 높은 안정성과 인센티브를 제공하는 JustLend 신규 풀로 자산을 재배분하는 리밸런싱을 권장합니다.`,
    };
  }
}
