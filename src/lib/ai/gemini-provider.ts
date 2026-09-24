import { LLMProvider, MockLLMProvider } from "./mock-provider";
import { ExtractedProfileSchema } from "./schemas";
import { NeedsProfile, AllocationPlan } from "@/domain/allocation/types";

export class GeminiLLMProvider implements LLMProvider {
  private apiKey: string;
  private fallback: MockLLMProvider;

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
  }> {
    if (!this.apiKey) {
      return this.fallback.extractNeeds(input);
    }

    const systemPrompt = `You are the AI Needs Analysis Engine for TRON Compass (GWDC 2026 TRON Challenge B).
Your job is to analyze the user's natural language investment goals and extract structured financial constraints.
You MUST output valid JSON matching this schema:
{
  "holdings": [{"asset": string, "amount": string, "estimatedUsd"?: string}],
  "horizonDays": number (investment horizon in days, default to 90 if unspecified),
  "minimumLiquidUsd": string (liquid reserve required in USD, default to "300" if unspecified),
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "maxVolatileExposurePct": string (decimal string e.g. "0.20" for 20%),
  "goal": "LIQUIDITY" | "BALANCED" | "YIELD",
  "allowedAssets": string[],
  "excludedAssets": string[],
  "missingFields": string[] (list any critical missing fields such as horizon or liquidity),
  "followUpQuestion": string (concise question in Korean if critical fields are missing),
  "summary": string (concise 2-sentence summary in Korean of confirmed profile)
}

Available assets in TRON ecosystem: USDD, USDT, TRX, sTRX, JST, SUN, BTT.
User wallet holdings (if connected): ${JSON.stringify(input.walletHoldings || [])}.
Do NOT hallucinate APYs or contract addresses.
Respond ONLY with the JSON object.`;

    const userMessage = `User Input: "${input.userInput}"`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

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

      const profile: NeedsProfile = {
        holdings:
          parsed.holdings.length > 0
            ? parsed.holdings
            : [{ asset: "USDD", amount: "1000", estimatedUsd: "1000" }],
        horizonDays: parsed.horizonDays ?? 90,
        minimumLiquidUsd: parsed.minimumLiquidUsd ?? "300",
        riskLevel: parsed.riskLevel ?? "LOW",
        maxVolatileExposurePct: parsed.maxVolatileExposurePct ?? "0.20",
        goal: parsed.goal ?? "BALANCED",
        allowedAssets: parsed.allowedAssets,
        excludedAssets: parsed.excludedAssets,
        missingFields: parsed.missingFields,
        assumptions: [
          `투자 기간 ${parsed.horizonDays ?? 90}일 기준 복리 수익 추정`,
          `최소 유동성 $${parsed.minimumLiquidUsd ?? "300"} 상시 확보`,
        ],
      };

      const needsClarification = parsed.missingFields.length > 0;

      return {
        profile,
        needsClarification,
        followUpQuestion: parsed.followUpQuestion,
        summary:
          parsed.summary ||
          `총 ${profile.holdings.map((h) => `${h.amount} ${h.asset}`).join(", ")} 자산을 기반으로 ${profile.horizonDays}일 동안 운용하는 ${profile.riskLevel} 위험 수준의 플랜을 구성했습니다.`,
      };
    } catch (err) {
      console.warn("Gemini call failed or timed out, falling back to MockLLMProvider:", err);
      return this.fallback.extractNeeds(input);
    }
  }

  async explainPlans(input: {
    profile: NeedsProfile;
    plans: AllocationPlan[];
  }): Promise<{
    planAExplanation: string;
    planBExplanation: string;
    comparisonRecommendation: string;
  }> {
    if (!this.apiKey) {
      return this.fallback.explainPlans(input);
    }

    const prompt = `You are the Financial Explanation Engine for TRON Compass.
Explain the following two deterministic plans to the user in polite, clear Korean.
Profile: ${JSON.stringify(input.profile)}
Plans: ${JSON.stringify(input.plans)}

Return JSON with format:
{
  "planAExplanation": "string in Korean",
  "planBExplanation": "string in Korean",
  "comparisonRecommendation": "string in Korean"
}`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
        }
      );
      if (!res.ok) throw new Error("Gemini explain error");
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      return JSON.parse(text);
    } catch {
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
  }> {
    if (!this.apiKey) {
      return this.fallback.explainRebalance(input);
    }

    const prompt = `You are the Rebalance Advisor for TRON Compass.
Explain why a rebalance is triggered and propose action in polite Korean.
Original Plan: ${JSON.stringify(input.originalPlan)}
Trigger Reason: ${input.triggerReason}
Market Change: ${input.currentMarketChange}

Return JSON with format:
{
  "explanation": "string in Korean",
  "actionAdvice": "string in Korean"
}`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
        }
      );
      if (!res.ok) throw new Error("Gemini rebalance error");
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      return JSON.parse(text);
    } catch {
      return this.fallback.explainRebalance(input);
    }
  }
}
