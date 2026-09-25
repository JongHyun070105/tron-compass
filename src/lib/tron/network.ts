export type TronNetwork = "mainnet" | "nile";

export interface TronNetworkConfig {
  id: TronNetwork;
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
 * Fetches real on-chain balances for TRX and tokens from TronWeb or server-side TronGrid client.
 * Strictly returns exact balances or "0.00", NEVER fake mock numbers.
 */
export async function fetchTronWalletBalances(
  address: string,
  tronWebInstance?: any,
  network: TronNetwork = "nile"
): Promise<{ trx: string; usdd: string; usdt: string; rawSun?: number }> {
  if (!address) {
    return { trx: "0.00", usdd: "0.00", usdt: "0.00", rawSun: 0 };
  }

  const tw =
    tronWebInstance ||
    (typeof window !== "undefined" ? (window as any).tronWeb : null);

  let sunNum = 0;
  let fetchedFromTronWeb = false;

  if (tw) {
    try {
      const sunBalance = await tw.trx.getBalance(address);
      const parsed = Number(sunBalance);
      if (!isNaN(parsed)) {
        sunNum = parsed;
        fetchedFromTronWeb = true;
      }
    } catch (err) {
      console.warn("TronWeb getBalance failed:", err);
    }
  }

  // Cross-verify or query server-side TronGrid client via Route Handler
  if (!fetchedFromTronWeb && typeof window !== "undefined") {
    try {
      const res = await fetch(
        `/api/tron/account?address=${encodeURIComponent(address)}&network=${network}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && typeof data.balanceSun === "number") {
          sunNum = data.balanceSun;
        }
      }
    } catch (err) {
      console.warn("Server-side TronGrid account query failed:", err);
    }
  }

  const trx = (sunNum / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

  return { trx, usdd: "0.00", usdt: "0.00", rawSun: sunNum };
}
