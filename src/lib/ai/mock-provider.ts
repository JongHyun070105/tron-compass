import { ExtractedProfile, PlanExplanation } from "./schemas";
import { NeedsProfile, AllocationPlan } from "@/domain/allocation/types";
import { extractGroundedHoldings } from "./grounding";

export interface LLMProvider {
  extractNeeds(input: {
    userInput: string;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<{
    profile: NeedsProfile;
    needsClarification: boolean;
    followUpQuestion?: string;
    summary: string;
    provider?: "gemini" | "mock_fallback";
  }>;

  explainPlans(input: {
    profile: NeedsProfile;
    plans: AllocationPlan[];
  }): Promise<PlanExplanation & { provider?: "gemini" | "mock_fallback" }>;

  explainRebalance(input: {
    originalPlan: AllocationPlan;
    triggerReason: string;
    currentMarketChange: string;
  }): Promise<{
    explanation: string;
    actionAdvice: string;
    provider?: "gemini" | "mock_fallback";
  }>;
}

export class MockLLMProvider implements LLMProvider {
  async extractNeeds(input: {
    userInput: string;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<{
    profile: NeedsProfile;
    needsClarification: boolean;
    followUpQuestion?: string;
    summary: string;
    provider: "mock_fallback";
  }> {
    const text = input.userInput.toLowerCase();

    // Planning quantities come from explicit user text; wallet execution balances stay separate.
    const holdings = extractGroundedHoldings(input.userInput);

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
    let minimumLiquidUsdtEquivalent = "300";
    const hasUsdtEquivalentUnit = /usdt\s*(?:-?\s*(?:equivalent|eq)|상당)/i.test(input.userInput);
    const liquidMatch = text.match(/(?:liquid|유동성|reserve|남겨|보유)[\s\w$-]*?([0-9,]+)/);
    if (liquidMatch && hasUsdtEquivalentUnit) {
      minimumLiquidUsdtEquivalent = liquidMatch[1].replace(/,/g, "");
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
    if (!holdings.length) missingFields.push("보유 자산 수량");
    const hasUnconvertedFiatReserve = /(?:\$|\busd\b|dollars?|달러)/i.test(input.userInput) && !hasUsdtEquivalentUnit;
    if (hasUnconvertedFiatReserve) missingFields.push("USDT-equivalent 유동성 목표");
    if (!horizonMatch) {
      missingFields.push("투자기간 (예: 90일)");
    }

    const needsClarification = missingFields.length > 0;
    const followUpQuestion = missingFields.includes("보유 자산 수량")
      ? "보유하신 자산과 수량을 알려주세요. 예: 1,000 USDD 또는 2,000 TRX."
      : hasUnconvertedFiatReserve
        ? "USD와 USDT-equivalent 간 환산 근거를 가정하지 않습니다. 최소 유동성 목표를 USDT-equivalent 수량으로 알려주세요."
      : !horizonMatch
        ? "희망하시는 목표 투자 기간(예: 30일, 90일, 180일)을 말씀해 주세요."
        : undefined;

    const summary = holdings.length
      ? `기록된 ${holdings.map((h) => `${h.amount} ${h.asset}`).join(" 및 ")} 수량을 바탕으로 ${horizonDays}일 운용 목표와 유동성 규칙 초안을 정리했습니다.`
      : "자산 수량이 확인되지 않아 배분 계산을 만들지 않았습니다.";

    let protectionClause: string | undefined = undefined;
    if (text.includes("여행") || text.includes("남겨") || text.includes("비상금")) {
      protectionClause = hasUnconvertedFiatReserve
        ? "USD로 지정된 보호 자금은 USDT-equivalent 단위 확인 전까지 미확정"
        : `지정 자금 ${minimumLiquidUsdtEquivalent} USDT-equivalent는 운용 대상에서 전액 제외`;
    }

    const profile: NeedsProfile = {
      holdings,
      horizonDays,
      minimumLiquidUsdtEquivalent: hasUnconvertedFiatReserve ? "0" : minimumLiquidUsdtEquivalent,
      riskLevel,
      maxVolatileExposurePct,
      goal,
      protectionClause,
      missingFields,
      assumptions: [
        `투자 기간 ${horizonDays}일 기준 복리 수익 추정`,
        hasUnconvertedFiatReserve
          ? "최소 유동성 목표는 USDT-equivalent 단위 확인 전까지 미확정"
          : `최소 유동성 규칙 초안: ${minimumLiquidUsdtEquivalent} USDT-equivalent`,
      ],
    };

    return {
      profile,
      needsClarification,
      followUpQuestion,
      summary,
      provider: "mock_fallback" as const,
    };
  }

  async explainPlans(input: {
    profile: NeedsProfile;
    plans: AllocationPlan[];
  }): Promise<PlanExplanation & { provider: "mock_fallback" }> {
    const [planA, planB] = input.plans;
    const explain = (plan?: AllocationPlan) => {
      if (!plan) return "No deterministic plan is available.";
      if (plan.valuationStatus === "UNAVAILABLE") {
        return "Live USDT-equivalent valuation evidence is unavailable. No allocation or USDT-equivalent return is produced.";
      }
      const failedRules = plan.constraintChecks.filter((check) => !check.passed).map((check) => check.name);
      if (failedRules.length) return `This option fails recorded checks: ${failedRules.join(", ")}. It is not eligible for execution.`;
      const incentiveYield = plan.expectedIncentiveYieldUsdtEquivalent === null
        ? "UNAVAILABLE"
        : `${plan.expectedIncentiveYieldUsdtEquivalent} USDT-equivalent`;
      const netYield = plan.expectedNetYieldUsdtEquivalent === null
        ? "UNAVAILABLE because source-backed incentive APY is missing"
        : `${plan.expectedNetYieldUsdtEquivalent} USDT-equivalent`;
      return `${plan.label}: ${plan.allocations.length} recorded allocation(s); estimated base yield ${plan.expectedBaseYieldUsdtEquivalent} USDT-equivalent, incentive yield ${incentiveYield}, Compass policy cost estimate ${plan.estimatedTotalCostUsdtEquivalent} USDT-equivalent, and net yield ${netYield} over ${plan.horizonDays} days. Cost estimates are not actual network fees; returns are estimates, not guarantees.`;
    };

    return {
      planAHighlights: [
        explain(planA),
        "Rule checks are produced by the deterministic evaluator.",
      ],
      planBHighlights: [
        explain(planB),
        "Unavailable incentive rewards are not included as sourced yield.",
      ],
      recommendationSummary: "Compare the deterministic rule checks and source-backed market evidence before selecting an option. No option guarantees principal, yield, or withdrawal timing.",
      planAExplanation: explain(planA),
      planBExplanation: explain(planB),
      comparisonRecommendation: "AI explains the recorded results. The deterministic evaluator controls allocations and My Rules checks.",
      provider: "mock_fallback" as const,
    };
  }

  async explainRebalance(input: {
    originalPlan: AllocationPlan;
    triggerReason: string;
    currentMarketChange: string;
  }): Promise<{
    explanation: string;
    actionAdvice: string;
    provider: "mock_fallback";
  }> {
    return {
      explanation: `기록된 결정 가정이 바뀌었는지 다시 확인합니다. ${input.triggerReason} ${input.currentMarketChange} 이 검토는 제안이며, 실제 시장 변화나 실행 결과를 뜻하지 않습니다.`,
      actionAdvice: "제안이 만들어지면 같은 My Rules 검사와 별도 사용자 승인이 필요합니다. 자동 거래는 하지 않습니다.",
      provider: "mock_fallback" as const,
    };
  }
}
