import { NextResponse } from "next/server";
import { fetchJustLendMarkets } from "@/lib/integrations/justlend/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  try {
    const data = await fetchJustLendMarkets({ forceRefresh });
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch JustLend markets",
      },
      { status: 500 }
    );
  }
}
