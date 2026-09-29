import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sumInternalTrxTransfersToOwner, trongridClient, TronNetwork } from "@/lib/tron/trongrid-client";
import { TRON_NETWORKS } from "@/lib/tron/network";

export const dynamic = "force-dynamic";

const VerifyTxInputSchema = z.object({
  txHash: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "Transaction hash must be a 64-character hexadecimal string"),
  network: z.enum(["mainnet", "nile"]).optional().default("nile"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = VerifyTxInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid transaction hash or network parameter",
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const { txHash, network } = parseResult.data;
    const receipt = await trongridClient.getTransactionInfo(txHash, network as TronNetwork);
    let returnedTrxSun: number | undefined;
    if (receipt.status === "CONFIRMED") {
      try {
        const transaction = await trongridClient.getTransaction(txHash, network as TronNetwork);
        const ownerAddress = (transaction?.raw_data as any)?.contract?.[0]?.parameter?.value?.owner_address;
        if (typeof ownerAddress === "string") returnedTrxSun = sumInternalTrxTransfersToOwner(receipt.rawReceipt, ownerAddress) ?? undefined;
      } catch {
        // Returning amount is auxiliary; a failed secondary lookup must not affect the verified receipt status.
      }
    }

    const explorerBase = TRON_NETWORKS[network].explorer;
    const explorerUrl = `${explorerBase}/#/transaction/${txHash}`;

    return NextResponse.json({
      success: true,
      txHash,
      network,
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      blockTimestamp: receipt.blockTimestamp,
      contractResult: receipt.contractResult,
      feeSun: receipt.feeSun,
      netFeeSun: receipt.netFeeSun,
      energyFeeSun: receipt.energyFeeSun,
      energyUsageTotal: receipt.energyUsageTotal,
      netUsage: receipt.netUsage,
      returnedTrxSun,
      explorerUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to verify transaction on TronGrid",
        message: err?.message?.slice(0, 150) || "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const txHash = searchParams.get("txHash") || searchParams.get("hash");
  const network = searchParams.get("network") || "nile";

  const parseResult = VerifyTxInputSchema.safeParse({ txHash, network });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid or missing txHash parameter (must be 64 hex characters)",
      },
      { status: 400 }
    );
  }

  try {
    const { txHash: cleanHash, network: cleanNetwork } = parseResult.data;
    const receipt = await trongridClient.getTransactionInfo(
      cleanHash,
      cleanNetwork as TronNetwork
    );

    const explorerBase = TRON_NETWORKS[cleanNetwork].explorer;
    const explorerUrl = `${explorerBase}/#/transaction/${cleanHash}`;

    return NextResponse.json({
      success: true,
      txHash: cleanHash,
      network: cleanNetwork,
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      blockTimestamp: receipt.blockTimestamp,
      contractResult: receipt.contractResult,
      feeSun: receipt.feeSun,
      netFeeSun: receipt.netFeeSun,
      energyFeeSun: receipt.energyFeeSun,
      energyUsageTotal: receipt.energyUsageTotal,
      netUsage: receipt.netUsage,
      explorerUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to verify transaction on TronGrid",
        message: err?.message?.slice(0, 150) || "Unknown error",
      },
      { status: 500 }
    );
  }
}
