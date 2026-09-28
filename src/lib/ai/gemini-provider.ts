import { LLMProvider, MockLLMProvider } from "./mock-provider";
import { ExtractedProfileSchema, PlanExplanationSchema, PlanExplanation } from "./schemas";
import { NeedsProfile, AllocationPlan } from "@/domain/allocation/types";
import { extractGroundedHoldings } from "./grounding";

function numericClaims(text: string): string[] {
  return [...text.matchAll(/(?:^|[^\p{L}])\$?\s*(\d[\d,]*(?:\.\d+)?)(?:\s*%|\s*(?:USD|TRX|USDD|USDT|일))?/giu)]
    .map((match) => match[1].replace(/,/g, ""));
}

function hasOnlyGroundedNumbers(explanation: PlanExplanation, source: unknown): boolean {
  const sourceText = JSON.stringify(source);
  const allowed = new Set(numericClaims(sourceText).map((value) => Number(value)));
  for (const value of [...allowed]) {
    if (value > 0 && value < 1) allowed.add(value * 100);
  }
  const outputText = Object.values(explanation).flat().join(" ");
  return numericClaims(outputText).every((value) => allowed.has(Number(value)));
}

export class GeminiLLMProvider implements LLMProvider {
  private apiKey: string;
  private fallback: MockLLMProvider;
  private timeoutMs: number = 8000; // 8s timeout to prevent slow latency in demo loop

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    this.fallback = new MockLLMProvider();
  }

  async extractNeeds(input: {
    userInput: string;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
    walletHoldings?: Array<{ asset: string; amount: string }>;
  }): Promise<{
    profile: NeedsProfile;
    needsClarification: boolean;
    followUpQuestion?: string;
    summary: string;
    provider: "gemini" | "mock_fallback";
  }> {
    if (!this.apiKey) {
      console.warn("[Gemini Provider] No GEMINI_API_KEY found, using MockLLMProvider");
      return this.fallback.extractNeeds(input);
    }

    const systemPrompt = `You are the AI Needs Analysis Engine for TRON Compass (GWDC 2026 TRON Challenge B).
Your job is to analyze the user's natural language investment goals and extract structured financial constraints.
You MUST output valid JSON matching this schema:
{
  "holdings": [{"asset": string, "amount": string}],
  "horizonDays": number (investment horizon in days, default to 90 if unspecified),
  "minimumLiquidUsd": string (liquid reserve required in USD, default to "300" if unspecified),
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "maxVolatileExposurePct": string (decimal string e.g. "0.20" for 20%),
  "goal": "LIQUIDITY" | "BALANCED" | "YIELD",
  "allowedAssets": string[],
  "excludedAssets": string[],
  "protectionClause": string (concise phrase if user specifies an excluded purpose or protection, e.g. "여행비 $300은 운용 대상에서 제외"),
  "missingFields": string[] (list any critical missing fields such as horizon or liquidity),
  "followUpQuestion": string (concise question in Korean if critical fields are missing),
  "summary": string (concise 2-sentence summary in Korean of confirmed profile)
}

Available assets in TRON ecosystem: USDD, USDT, TRX, sTRX, JST, SUN, BTT.
User wallet holdings (if connected): ${JSON.stringify(input.walletHoldings || [])}.
Only extract asset quantities explicitly present in the user's words or supplied wallet balances. Never estimate USD values, balances, APY, fees, allocation math, contract addresses, or transaction data. Leave missing fields empty and ask a follow-up question. Do NOT hallucinate APYs or contract addresses.
Respond ONLY with the JSON object.`;

    const userMessage = `User Input: "${input.userInput}"`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: `${systemPrompt}\n\n${userMessage}` }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          }),
        }
      );

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Gemini upstream HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Empty candidate from Gemini");

      const parsed = ExtractedProfileSchema.parse(JSON.parse(rawText));
      const holdings = extractGroundedHoldings(input.userInput, input.walletHoldings);
      const missingFields = [...parsed.missingFields];
      if (!holdings.length && !missingFields.includes("보유 자산 수량")) {
        missingFields.push("보유 자산 수량");
      }

      const profile: NeedsProfile = {
        holdings,
        horizonDays: parsed.horizonDays ?? 90,
        minimumLiquidUsd: parsed.minimumLiquidUsd ?? "300",
        riskLevel: parsed.riskLevel ?? "LOW",
        maxVolatileExposurePct: parsed.maxVolatileExposurePct ?? "0.20",
        goal: parsed.goal ?? "BALANCED",
        allowedAssets: parsed.allowedAssets,
        excludedAssets: parsed.excludedAssets,
        protectionClause: parsed.protectionClause,
        missingFields,
        assumptions: [
          `투자 기간 ${parsed.horizonDays ?? 90}일 기준 복리 수익 추정`,
          `최소 유동성 $${parsed.minimumLiquidUsd ?? "300"} 상시 확보`,
        ],
      };

      const needsClarification = missingFields.length > 0;

      console.log("[Gemini Provider] Live Gemini 2.5 Flash response received for extractNeeds");

      return {
        profile,
        needsClarification,
        followUpQuestion: parsed.followUpQuestion || (!holdings.length ? "보유하신 자산과 수량을 알려주세요. 예: 1,000 USDD 또는 2,000 TRX." : undefined),
        summary:
          parsed.summary ||
          `총 ${profile.holdings.map((h) => `${h.amount} ${h.asset}`).join(", ")} 자산을 기반으로 ${profile.horizonDays}일 동안 운용하는 ${profile.riskLevel} 위험 수준의 플랜을 구성했습니다.`,
        provider: "gemini",
      };
    } catch (err: any) {
      console.warn(
        `[Gemini Provider] Gemini extractNeeds failed or timed out (${err?.message || err}), falling back to MockLLMProvider`
      );
      return this.fallback.extractNeeds(input);
    }
  }

  async explainPlans(input: {
    profile: NeedsProfile;
    plans: AllocationPlan[];
  }): Promise<PlanExplanation & { provider: "gemini" | "mock_fallback" }> {
    if (!this.apiKey || input.plans.some((plan) => plan.usdValuationStatus === "UNAVAILABLE")) {
      return this.fallback.explainPlans(input);
    }

    const simplifiedPlans = input.plans.map((p) => ({
      id: p.id,
      label: p.label,
      strategyType: p.strategyType,
      effectiveNetApy: p.effectiveNetApy,
      usdValuationStatus: p.usdValuationStatus,
      expectedBaseYieldUsd: p.expectedBaseYieldUsd,
      expectedIncentiveYieldUsd: p.expectedIncentiveYieldUsd,
      estimatedTotalCostUsd: p.estimatedTotalCostUsd,
      liquidReserveUsd: p.liquidReserveUsd,
      liquidReservePct: p.liquidReservePct,
      expectedNetYieldUsd: p.expectedNetYieldUsd,
      allocations: p.allocations.map(
        (a) => `${a.amount} ${a.asset} in ${a.productName} (${a.totalApy})`
      ),
    }));

const prompt = `You are the explanation engine for TRON Compass (GWDC 2026 TRON Challenge B).
Explain the following two deterministic plans to the user in concise, polite Korean.
Provide concise bullet summaries for each plan and a short comparison. The structured plans, evidence, and rules are authoritative.
Do not invent or reformat any financial number. Use a number only when the exact value or its percent conversion is present in the structured inputs. If valuation is unavailable, say so and do not supply dollar returns or exposure percentages. Do not claim principal safety, guaranteed yield, immediate withdrawal, or fee-free transactions.

Profile: ${JSON.stringify(input.profile)}
Plans: ${JSON.stringify(simplifiedPlans)}

Output valid JSON matching this schema:
{
  "planAHighlights": [
    "Summarize recorded checks and evidence",
    "Use only values present in the structured inputs"
  ],
  "planBHighlights": [
    "Summarize recorded checks and evidence",
    "State when a value is unavailable"
  ],
  "recommendationSummary": "1-2 sentence recommendation in polite Korean",
  "planAExplanation": "detailed explanation for Plan A in Korean (for detailed drawer view)",
  "planBExplanation": "detailed explanation for Plan B in Korean (for detailed drawer view)",
  "comparisonRecommendation": "detailed comparison recommendation in Korean"
}
Respond ONLY with the JSON object.`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.15,
            },
          }),
        }
      );

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Gemini explain error HTTP ${res.status}`);
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty candidate in Gemini explain");

      const parsed = PlanExplanationSchema.parse(JSON.parse(text));
      if (!hasOnlyGroundedNumbers(parsed, { profile: input.profile, plans: simplifiedPlans })) {
        console.warn("[Gemini Provider] Unsupported numeric claim; using locally grounded explanation");
        return this.fallback.explainPlans(input);
      }
      console.log("[Gemini Provider] Live Gemini 2.5 Flash response received for explainPlans");

      return {
        ...parsed,
        provider: "gemini",
      };
    } catch (err: any) {
      console.warn(
        `[Gemini Provider] Gemini explainPlans failed or timed out (${err?.message || err}), falling back to MockLLMProvider`
      );
      return this.fallback.explainPlans(input);
    }
  }

  async explainRebalance(input: {
    originalPlan: AllocationPlan;
    triggerReason: string;
    currentMarketChange: string;
  }): Promise<{
    explanation: string;
    actionAdvice: string;
    provider: "gemini" | "mock_fallback";
  }> {
    if (!this.apiKey) {
      return this.fallback.explainRebalance(input);
    }

    const prompt = `You are the Rebalance Advisor for TRON Compass (GWDC 2026 TRON Challenge B).
Explain why a rebalance is triggered and propose action in concise, polite Korean (1-2 sentences each).
Original Plan: ${JSON.stringify({
      label: input.originalPlan.label,
      effectiveNetApy: input.originalPlan.effectiveNetApy,
      liquidReserveUsd: input.originalPlan.liquidReserveUsd,
    })}
Trigger Reason: ${input.triggerReason}
Market Change: ${input.currentMarketChange}

Return JSON with format:
{
  "explanation": "concise explanation in Korean",
  "actionAdvice": "concise action advice in Korean"
}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
        }
      );

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Gemini rebalance error HTTP ${res.status}`);
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty candidate in Gemini rebalance");

      const parsed = JSON.parse(text);
      console.log("[Gemini Provider] Live Gemini 2.5 Flash response received for explainRebalance");

      return {
        explanation: parsed.explanation,
        actionAdvice: parsed.actionAdvice,
        provider: "gemini",
      };
    } catch (err: any) {
      console.warn(
        `[Gemini Provider] Gemini explainRebalance failed or timed out (${err?.message || err}), falling back to MockLLMProvider`
      );
      return this.fallback.explainRebalance(input);
    }
  }
}
