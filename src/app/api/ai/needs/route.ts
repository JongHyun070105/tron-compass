import { NextResponse } from "next/server";
import { getLLMProvider } from "@/lib/ai/provider";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userInput } = body;

    if (!userInput || typeof userInput !== "string") {
      return NextResponse.json(
        { success: false, error: "userInput is required as a non-empty string" },
        { status: 400 }
      );
    }

    const provider = getLLMProvider();
    const result = await provider.extractNeeds({
      userInput,
    });

    return NextResponse.json({
      success: true,
      data: result,
      provider: result.provider || "mock_fallback",
      model: result.provider === "gemini" ? "gemini-2.5-flash" : "rules-engine",
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to analyze needs",
      },
      { status: 500 }
    );
  }
}
