import { NextResponse } from "next/server";
import { fetchUsddEvidence } from "@/lib/integrations/usdd/client";

export async function GET() {
  try {
    const evidence = await fetchUsddEvidence();
    return NextResponse.json({
      success: true,
      data: evidence,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch USDD evidence",
      },
      { status: 500 }
    );
  }
}
