import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trongridClient, TronNetwork } from "@/lib/tron/trongrid-client";

export const dynamic = "force-dynamic";

const AccountQuerySchema = z.object({
  address: z.string().trim().min(20, "Invalid TRON address format"),
  network: z.enum(["mainnet", "nile"]).optional().default("nile"),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") || "";
  const network = searchParams.get("network") || "nile";

  const parseResult = AccountQuerySchema.safeParse({ address, network });
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid TRON address format or network parameter",
        details: parseResult.error.format(),
      },
      { status: 400 }
    );
  }

  const { address: cleanAddress, network: cleanNetwork } = parseResult.data;

  try {
    const [account, resources] = await Promise.all([
      trongridClient.getAccount(cleanAddress, cleanNetwork as TronNetwork),
      trongridClient.getAccountResources(cleanAddress, cleanNetwork as TronNetwork),
    ]);

    if (!account) {
      return NextResponse.json(
        { success: false, error: "TronGrid did not return an account snapshot" },
        { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        address: cleanAddress,
        network: cleanNetwork,
        balanceSun: account?.balanceSun || 0,
        balanceTrx: account?.balanceTrx || "0.000000",
        accountName: account?.accountName || null,
        isWitness: !!account?.isWitness,
        resources,
        trc20Balances: account?.trc20Balances || {},
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch account state from TronGrid",
        message: err?.message?.slice(0, 150) || "Unknown error",
      },
      { status: 500 }
    );
  }
}
