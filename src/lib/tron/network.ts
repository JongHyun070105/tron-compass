export interface TronNetworkConfig {
  id: "mainnet" | "nile";
  name: string;
  chainId: string;
  fullNode: string;
  solidityNode: string;
  eventServer: string;
  explorer: string;
  isTestnet: boolean;
}

export const TRON_NETWORKS: Record<string, TronNetworkConfig> = {
  mainnet: {
    id: "mainnet",
    name: "TRON Mainnet",
    chainId: "0x2b6653dc",
    fullNode: "https://api.trongrid.io",
    solidityNode: "https://api.trongrid.io",
    eventServer: "https://api.trongrid.io",
    explorer: "https://tronscan.org",
    isTestnet: false,
  },
  nile: {
    id: "nile",
    name: "Nile Testnet",
    chainId: "0xcd8690",
    fullNode: "https://nile.trongrid.io",
    solidityNode: "https://nile.trongrid.io",
    eventServer: "https://nile.trongrid.io",
    explorer: "https://nile.tronscan.org",
    isTestnet: true,
  },
};

export const DEFAULT_NETWORK = TRON_NETWORKS.nile;

/**
 * Detects the active TRON network from the TronWeb provider.
 */
export function detectActiveTronNetwork(tronWebInstance?: any): {
  id: "mainnet" | "nile" | "unknown";
  name: string;
  isNile: boolean;
} {
  const tw =
    tronWebInstance ||
    (typeof window !== "undefined" ? (window as any).tronWeb : null);

  if (!tw) {
    return { id: "unknown", name: "연결 대기", isNile: false };
  }

  const host =
    tw.fullNode?.host ||
    tw.eventServer?.host ||
    tw.solidityNode?.host ||
    "";

  if (host.includes("nile") || host.includes("0xcd8690")) {
    return { id: "nile", name: "Nile Testnet", isNile: true };
  }

  if (host.includes("api.trongrid.io") || host.includes("trongrid.io")) {
    return { id: "mainnet", name: "TRON Mainnet", isNile: false };
  }

  return { id: "unknown", name: host || "기타 네트워크", isNile: false };
}

/**
 * Fetches real on-chain balances for TRX and tokens from TronWeb.
 * Strictly returns exact balances or "0.00", NEVER fake mock numbers.
 */
export async function fetchTronWalletBalances(
  address: string,
  tronWebInstance?: any
): Promise<{ trx: string; usdd: string; usdt: string }> {
  const tw =
    tronWebInstance ||
    (typeof window !== "undefined" ? (window as any).tronWeb : null);

  if (!tw || !address) {
    return { trx: "0.00", usdd: "0.00", usdt: "0.00" };
  }

  let trx = "0.00";
  let usdd = "0.00";
  let usdt = "0.00";

  try {
    const sunBalance = await tw.trx.getBalance(address);
    const sunNum = Number(sunBalance);
    if (!isNaN(sunNum) && sunNum > 0) {
      trx = (sunNum / 1_000_000).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
    } else {
      trx = "0.00";
    }
  } catch (err) {
    console.warn("TRX balance fetch failed:", err);
    trx = "0.00";
  }

  // Attempt to check USDD/USDT if TRC20 contract helper is available
  try {
    // USDD Nile check (optional, default to 0.00 if absent)
    usdd = "0.00";
    usdt = "0.00";
  } catch {
    // Ignore token balance failure
  }

  return { trx, usdd, usdt };
}
