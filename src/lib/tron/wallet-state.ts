import {
  detectActiveTronNetwork,
  fetchNileJTrxBalance,
  fetchNileJTrxExchangeRate,
  fetchTronWalletBalances,
  TronNetwork,
} from "@/lib/tron/network";
import { Decimal } from "@/lib/math/decimal";

export interface WalletBalanceSnapshot {
  address: string;
  networkId: TronNetwork | "unknown";
  network: string;
  trxBalance: string | null;
  jTrxBalance: string | null;
  exchangeRateRaw: string | null;
  fetchedAt: string;
}

function sameDecimal(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  try {
    const leftValue = new Decimal(left);
    const rightValue = new Decimal(right);
    return leftValue.isFinite() && rightValue.isFinite() && leftValue.eq(rightValue);
  } catch {
    return false;
  }
}

export function walletSnapshotsMatchReviewed(
  reviewed: WalletBalanceSnapshot | null,
  current: WalletBalanceSnapshot | null,
  action: "SUPPLY" | "REDEEM"
): boolean {
  if (!reviewed || !current) return false;
  return reviewed.address === current.address &&
    reviewed.networkId === current.networkId &&
    reviewed.networkId === "nile" &&
    sameDecimal(reviewed.trxBalance, current.trxBalance) &&
    sameDecimal(reviewed.jTrxBalance, current.jTrxBalance) &&
    (action !== "REDEEM" || reviewed.exchangeRateRaw === current.exchangeRateRaw);
}

export function networkFromChainId(chainId?: string | null): {
  id: TronNetwork | "unknown";
  name: string;
} | null {
  const normalized = chainId?.toLowerCase();
  if (normalized === "0x2b6653dc") return { id: "mainnet", name: "TRON Mainnet" };
  if (normalized === "0xcd8690dc" || normalized === "0xcd8690") return { id: "nile", name: "Nile Testnet" };
  return null;
}

export async function readWalletBalanceSnapshot(
  address: string,
  tronWeb: any,
  networkId: TronNetwork | "unknown",
  networkName: string,
  options: { forceFresh?: boolean } = {}
): Promise<WalletBalanceSnapshot> {
  if (!address || networkId === "unknown") {
    return {
      address,
      networkId,
      network: networkName,
      trxBalance: null,
      jTrxBalance: null,
      exchangeRateRaw: null,
      fetchedAt: new Date().toISOString(),
    };
  }

  const balances = await fetchTronWalletBalances(address, tronWeb, networkId, {
    forceFresh: options.forceFresh,
  });
  const [jTrxBalance, exchangeRate] = networkId === "nile"
    ? options.forceFresh
      ? [
          balances.jTrx ?? (balances.trx === "UNAVAILABLE" ? null : await fetchNileJTrxBalance(address, tronWeb, networkId)),
          await fetchNileJTrxExchangeRate(tronWeb, networkId),
        ] as const
      : await Promise.all([
          fetchNileJTrxBalance(address, tronWeb, networkId),
          fetchNileJTrxExchangeRate(tronWeb, networkId),
        ])
    : [null, null] as const;

  return {
    address,
    networkId,
    network: networkName,
    trxBalance: balances.trx === "UNAVAILABLE" ? null : balances.trx,
    jTrxBalance,
    exchangeRateRaw: exchangeRate?.raw ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export function detectWalletNetwork(tronWeb: any, chainId?: string | null): {
  id: TronNetwork | "unknown";
  name: string;
} {
  if (chainId !== undefined && chainId !== null) {
    return networkFromChainId(chainId) ?? { id: "unknown", name: "Unsupported TRON network" };
  }
  const detected = detectActiveTronNetwork(tronWeb);
  return {
    id: detected.id === "nile" || detected.id === "mainnet" ? detected.id : "unknown",
    name: detected.name,
  };
}
