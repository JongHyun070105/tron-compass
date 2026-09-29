import { z } from "zod";
import { TRON_NETWORKS, TronNetworkConfig } from "./network";

export type TronNetwork = "mainnet" | "nile";

/**
 * Server-side TronGrid account response data.
 */
export interface TronGridAccount {
  address: string;
  balanceSun: number;
  balanceTrx: string;
  createTime?: number;
  accountName?: string;
  isWitness?: boolean;
  trc20Balances: Record<string, string>;
}

/**
 * Server-side TronGrid account resource data (Bandwidth & Energy).
 */
export interface TronAccountResources {
  freeNetLimit: number;
  freeNetUsed: number;
  freeNetAvailable: number;
  netLimit: number;
  netUsed: number;
  netAvailable: number;
  energyLimit: number;
  energyUsed: number;
  energyAvailable: number;
  totalEnergyLimit?: number;
  totalEnergyWeight?: number;
  totalNetLimit?: number;
  totalNetWeight?: number;
}

/**
 * Transaction execution status and receipt.
 */
export interface TronTransactionReceipt {
  txHash: string;
  network: TronNetwork;
  status: "CONFIRMED" | "PENDING" | "FAILED" | "NOT_FOUND";
  blockNumber?: number;
  blockTimestamp?: number;
  contractResult?: string;
  feeSun?: number;
  netFeeSun?: number;
  energyFeeSun?: number;
  energyUsageTotal?: number;
  netUsage?: number;
  rawReceipt?: any;
}

export function sumInternalTrxTransfersToOwner(rawReceipt: unknown, ownerAddress: string): number | null {
  const internalTransactions = (rawReceipt as any)?.internal_transactions;
  if (!ownerAddress || !Array.isArray(internalTransactions)) return null;
  const total = internalTransactions.reduce((sum: number, transfer: any) => {
    if (typeof transfer?.transferTo_address !== "string" ||
        transfer.transferTo_address.toLowerCase() !== ownerAddress.toLowerCase() ||
        !Array.isArray(transfer.callValueInfo)) return sum;
    return transfer.callValueInfo.reduce((transferSum: number, value: any) => {
      if (value?.tokenId || !Number.isSafeInteger(value?.callValue) || value.callValue < 0) return transferSum;
      const next = transferSum + value.callValue;
      return Number.isSafeInteger(next) ? next : transferSum;
    }, sum);
  }, 0);
  return total > 0 ? total : null;
}

// Zod schemas for validating TronGrid responses
const TronGridAccountItemSchema = z.object({
  address: z.string().optional(),
  balance: z.number().optional().default(0),
  create_time: z.number().optional(),
  account_name: z.string().optional(),
  is_witness: z.boolean().optional(),
  trc20: z.array(z.record(z.string())).optional().default([]),
});

const TronGridAccountResponseSchema = z.object({
  data: z.array(TronGridAccountItemSchema).optional().default([]),
  success: z.boolean().optional(),
  error: z.string().optional(),
  statusCode: z.number().optional(),
});

const TronAccountResourceResponseSchema = z.object({
  freeNetLimit: z.number().optional().default(0),
  freeNetUsed: z.number().optional().default(0),
  NetLimit: z.number().optional().default(0),
  NetUsed: z.number().optional().default(0),
  EnergyLimit: z.number().optional().default(0),
  EnergyUsed: z.number().optional().default(0),
  TotalNetLimit: z.number().optional(),
  TotalNetWeight: z.number().optional(),
  TotalEnergyLimit: z.number().optional(),
  TotalEnergyWeight: z.number().optional(),
});

const TronTransactionByIdResponseSchema = z.object({
  txID: z.string().optional(),
  ret: z
    .array(
      z.object({
        contractRet: z.string().optional(),
        fee: z.number().optional(),
      })
    )
    .optional(),
  raw_data: z.any().optional(),
  raw_data_hex: z.string().optional(),
  signature: z.array(z.string()).optional(),
  Error: z.string().optional(),
});

const TronTransactionInfoResponseSchema = z.object({
  id: z.string().optional(),
  fee: z.number().optional(),
  blockNumber: z.number().optional(),
  blockTimeStamp: z.number().optional(),
  contractResult: z.array(z.string()).optional(),
  contract_address: z.string().optional(),
  receipt: z
    .object({
      net_usage: z.number().optional(),
      net_fee: z.number().optional(),
      energy_usage: z.number().optional(),
      energy_fee: z.number().optional(),
      energy_usage_total: z.number().optional(),
      result: z.string().optional(),
    })
    .optional(),
  result: z.string().optional(),
  resMessage: z.string().optional(),
  Error: z.string().optional(),
});

export class TronGridClient {
  private readonly defaultNetwork: TronNetwork;

  constructor(defaultNetwork: TronNetwork = "nile") {
    // Strictly enforce server-side execution
    if (typeof window !== "undefined") {
      throw new Error(
        "TronGridClient can only be instantiated and executed on the server side."
      );
    }
    this.defaultNetwork = defaultNetwork;
  }

  private getApiKey(): string | undefined {
    return process.env.TRONGRID_API_KEY?.trim() || undefined;
  }

  private getBaseUrl(network?: TronNetwork): string {
    const net = network || this.defaultNetwork;
    return TRON_NETWORKS[net]?.fullNode || TRON_NETWORKS.nile.fullNode;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const apiKey = this.getApiKey();
    if (apiKey) {
      headers["TRON-PRO-API-KEY"] = apiKey;
    }

    return headers;
  }

  /**
   * Internal fetch wrapper with timeout, transient retry, and secret redaction.
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST";
      body?: any;
      network?: TronNetwork;
      timeoutMs?: number;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const {
      method = "GET",
      body,
      network = this.defaultNetwork,
      timeoutMs = 8000,
      maxRetries = 2,
    } = options;

    const baseUrl = this.getBaseUrl(network);
    const url = `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers = this.getHeaders();

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
          cache: "no-store",
        });

        clearTimeout(timeoutId);

        // Check if retryable status
        if ([429, 502, 503, 504].includes(response.status) && attempt <= maxRetries) {
          const backoffDelay = attempt * 400;
          await new Promise((r) => setTimeout(r, backoffDelay));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(
            `TronGrid HTTP ${response.status} on ${endpoint}: ${errorText.slice(0, 150)}`
          );
        }

        const data = await response.json();
        return data as T;
      } catch (err: any) {
        lastError = err;
        if (attempt <= maxRetries && err.name !== "AbortError") {
          await new Promise((r) => setTimeout(r, attempt * 300));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error(`TronGrid request failed on ${endpoint}`);
  }

  /**
   * Checks whether the TronGrid API key is configured.
   */
  public isApiKeyConfigured(): boolean {
    return !!this.getApiKey();
  }

  /**
   * Health / ping check via getnowblock.
   */
  public async getNowBlock(network?: TronNetwork): Promise<{
    blockNumber: number;
    blockTimestamp: number;
    txCount: number;
  }> {
    const res = await this.request<any>("/wallet/getnowblock", {
      method: "GET",
      network,
    });

    const blockHeader = res?.block_header?.raw_data;
    if (!blockHeader) {
      throw new Error("Invalid getnowblock response structure from TronGrid.");
    }

    return {
      blockNumber: blockHeader.number || 0,
      blockTimestamp: blockHeader.timestamp || 0,
      txCount: (res.transactions || []).length,
    };
  }

  /**
   * Queries account information from TronGrid V1 API (/v1/accounts/{address}).
   */
  public async getAccount(
    address: string,
    network?: TronNetwork
  ): Promise<TronGridAccount | null> {
    if (!address) return null;

    try {
      const raw = await this.request<unknown>(
        `/v1/accounts/${encodeURIComponent(address)}`,
        {
          method: "GET",
          network,
        }
      );

      const parsed = TronGridAccountResponseSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.data || parsed.data.data.length === 0) {
        return null;
      }

      const acc = parsed.data.data[0];
      const balanceSun = acc.balance || 0;
      const balanceTrx = (balanceSun / 1_000_000).toFixed(6);

      const trc20Balances: Record<string, string> = {};
      if (acc.trc20 && Array.isArray(acc.trc20)) {
        for (const item of acc.trc20) {
          for (const [contractAddr, bal] of Object.entries(item)) {
            trc20Balances[contractAddr] = bal;
          }
        }
      }

      return {
        address: acc.address || address,
        balanceSun,
        balanceTrx,
        createTime: acc.create_time,
        accountName: acc.account_name,
        isWitness: acc.is_witness,
        trc20Balances,
      };
    } catch {
      return null;
    }
  }

  /**
   * Queries account bandwidth and energy resources (/wallet/getaccountresource).
   */
  public async getAccountResources(
    address: string,
    network?: TronNetwork
  ): Promise<TronAccountResources> {
    const raw = await this.request<unknown>("/wallet/getaccountresource", {
      method: "POST",
      body: { address, visible: true },
      network,
    });

    const parsed = TronAccountResourceResponseSchema.safeParse(raw);
    const data = parsed.success ? parsed.data : {
      freeNetLimit: 0,
      freeNetUsed: 0,
      NetLimit: 0,
      NetUsed: 0,
      EnergyLimit: 0,
      EnergyUsed: 0,
    };

    const freeNetLimit = data.freeNetLimit || 0;
    const freeNetUsed = data.freeNetUsed || 0;
    const freeNetAvailable = Math.max(0, freeNetLimit - freeNetUsed);

    const netLimit = data.NetLimit || 0;
    const netUsed = data.NetUsed || 0;
    const netAvailable = Math.max(0, netLimit - netUsed);

    const energyLimit = data.EnergyLimit || 0;
    const energyUsed = data.EnergyUsed || 0;
    const energyAvailable = Math.max(0, energyLimit - energyUsed);

    return {
      freeNetLimit,
      freeNetUsed,
      freeNetAvailable,
      netLimit,
      netUsed,
      netAvailable,
      energyLimit,
      energyUsed,
      energyAvailable,
      totalEnergyLimit: data.TotalEnergyLimit,
      totalEnergyWeight: data.TotalEnergyWeight,
      totalNetLimit: data.TotalNetLimit,
      totalNetWeight: data.TotalNetWeight,
    };
  }

  /**
   * Queries transaction body by ID (/wallet/gettransactionbyid).
   */
  public async getTransaction(
    txHash: string,
    network?: TronNetwork
  ): Promise<z.infer<typeof TronTransactionByIdResponseSchema> | null> {
    if (!txHash) return null;

    const raw = await this.request<unknown>("/wallet/gettransactionbyid", {
      method: "POST",
      body: { value: txHash },
      network,
    });

    const parsed = TronTransactionByIdResponseSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.txID) {
      return null;
    }

    return parsed.data;
  }

  /**
   * Queries transaction execution receipt and confirms on-chain state (/wallet/gettransactioninfobyid).
   *
   * Crucial TRON semantics:
   * - If transaction was broadcast and in pool, gettransactionbyid may exist, but gettransactioninfobyid
   *   returns {} until the block is mined/executed.
   * - Once included in a block, gettransactioninfobyid returns { id, blockNumber, receipt, ... }.
   * - receipt.result === "SUCCESS" or undefined in standard receipt means SUCCESS.
   * - receipt.result === "REVERT" or "OUT_OF_ENERGY" or info.result === "FAILED" means FAILED.
   */
  public async getTransactionInfo(
    txHash: string,
    network?: TronNetwork
  ): Promise<TronTransactionReceipt> {
    const net = network || this.defaultNetwork;

    const rawInfo = await this.request<unknown>("/wallet/gettransactioninfobyid", {
      method: "POST",
      body: { value: txHash },
      network: net,
    });

    const parsedInfo = TronTransactionInfoResponseSchema.safeParse(rawInfo);
    const info = parsedInfo.success ? parsedInfo.data : null;

    if (
      info?.id?.toLowerCase() === txHash.toLowerCase() &&
      Number.isSafeInteger(info.blockNumber) &&
      (info.blockNumber ?? 0) > 0
    ) {
      const receipt = info.receipt;
      const receiptResult = receipt?.result;
      const topResult = info.result;

      // A block number alone does not prove successful execution. Require an
      // explicit SUCCESS result; keep incomplete receipt evidence pending.
      const isExplicitFail = topResult === "FAILED" ||
        (receiptResult !== undefined && receiptResult !== "SUCCESS");
      const hasExplicitSuccess = topResult === "SUCCESS" || receiptResult === "SUCCESS";
      const status: "CONFIRMED" | "FAILED" | "PENDING" = isExplicitFail
        ? "FAILED"
        : hasExplicitSuccess
          ? "CONFIRMED"
          : "PENDING";

      return {
        txHash,
        network: net,
        status,
        blockNumber: info.blockNumber,
        blockTimestamp: info.blockTimeStamp,
        contractResult: receiptResult || topResult || "PENDING",
        feeSun: info.fee,
        netFeeSun: receipt?.net_fee,
        energyFeeSun: receipt?.energy_fee,
        energyUsageTotal: receipt?.energy_usage_total,
        netUsage: receipt?.net_usage,
        // Keep the raw receipt for server-side extraction of contract events and internal TRX transfers.
        rawReceipt: rawInfo,
      };
    }

    // Check if the transaction is at least known/broadcast in the pending pool or raw block
    const txBody = await this.getTransaction(txHash, net);
    if (txBody && txBody.txID) {
      const contractRet = txBody.ret?.[0]?.contractRet;
      if (contractRet && contractRet !== "SUCCESS") {
        return {
          txHash,
          network: net,
          status: "FAILED",
          contractResult: contractRet,
        };
      }

      return {
        txHash,
        network: net,
        status: "PENDING",
      };
    }

    return {
      txHash,
      network: net,
      status: "NOT_FOUND",
    };
  }
}

// Singleton server-side client instance
export const trongridClient = new TronGridClient("nile");
