import { NextResponse } from "next/server";
import { fetchUsddEvidence } from "@/lib/integrations/usdd/client";

export async function GET(request: Request) {
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "true";
  try {
    const evidence = await fetchUsddEvidence({ forceRefresh });
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
