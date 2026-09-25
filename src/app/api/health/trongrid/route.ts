import { NextRequest, NextResponse } from "next/server";
import { trongridClient, TronNetwork } from "@/lib/tron/trongrid-client";
import { TRON_NETWORKS } from "@/lib/tron/network";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const netParam = searchParams.get("network");
  const network: TronNetwork = netParam === "mainnet" ? "mainnet" : "nile";

  const isConfigured = trongridClient.isApiKeyConfigured();
  const startTime = Date.now();
  const testedEndpoint = `${TRON_NETWORKS[network].fullNode}/wallet/getnowblock`;

  try {
    const blockData = await trongridClient.getNowBlock(network);
    const latencyMs = Date.now() - startTime;

    return NextResponse.json(
      {
        status: "HEALTHY",
        configured: isConfigured,
        network,
        reachable: true,
        blockNumber: blockData.blockNumber,
        txCountInBlock: blockData.txCount,
        latencyMs,
        testedEndpoint,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return NextResponse.json(
      {
        status: "DEGRADED",
        configured: isConfigured,
        network,
        reachable: false,
        error: "Failed to communicate with TronGrid node endpoint",
        latencyMs,
        testedEndpoint,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
