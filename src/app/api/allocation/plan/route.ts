import { NextResponse } from "next/server";
import { generateAllocationPlans } from "@/domain/allocation/engine";
import { fetchJustLendMarkets } from "@/lib/integrations/justlend/client";
import { NeedsProfile } from "@/domain/allocation/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { profile } = body as { profile: NeedsProfile };

    if (!profile || !profile.holdings) {
      return NextResponse.json(
        { success: false, error: "Valid NeedsProfile is required" },
        { status: 400 }
      );
    }

    // Fetch live normalized opportunities
    const { markets } = await fetchJustLendMarkets();

    const { plans, totalCapitalUsdtEquivalent } = generateAllocationPlans(
      profile,
      markets,
      new Date().toISOString()
    );

    return NextResponse.json({
      success: true,
      data: {
        plans,
        totalCapitalUsdtEquivalent,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to calculate allocation plans",
      },
      { status: 500 }
    );
  }
}
