import { NextResponse } from "next/server";
import { getLLMProvider } from "@/lib/ai/provider";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, profile, plans, originalPlan, triggerReason, currentMarketChange } = body;

    const provider = getLLMProvider();

    if (type === "REBALANCE") {
      const result = await provider.explainRebalance({
        originalPlan,
        triggerReason,
        currentMarketChange,
      });
      return NextResponse.json({ success: true, data: result });
    }

    // Default: EXPLAIN_PLANS
    const result = await provider.explainPlans({
      profile,
      plans,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to generate explanation",
      },
      { status: 500 }
    );
  }
}
