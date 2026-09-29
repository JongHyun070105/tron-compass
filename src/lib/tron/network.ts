import { Decimal, formatUnits, parseUnitsExact } from "@/lib/math/decimal";
import { JTRX_ABI, JUSTLEND_NILE_CONTRACTS } from "@/lib/integrations/justlend/contracts";

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
 * Returns the observed TRX balance and marks token balances unavailable until token reads exist.
 */
export async function fetchTronWalletBalances(
  address: string,
  tronWebInstance?: any,
  network: TronNetwork = "nile"
): Promise<{ trx: string; usdd: string; usdt: string; rawSun?: string }> {
  if (!address) return { trx: "UNAVAILABLE", usdd: "UNAVAILABLE", usdt: "UNAVAILABLE" };

  const tw =
    tronWebInstance ||
    (typeof window !== "undefined" ? (window as any).tronWeb : null);

  let sunRaw: string | null = null;
  let fetchedFromTronWeb = false;
  let balanceAvailable = false;

  if (tw) {
    try {
      const sunBalance = await tw.trx.getBalance(address);
      const raw = String(sunBalance);
      const exactNumber = typeof sunBalance !== "number" || Number.isSafeInteger(sunBalance);
      if (exactNumber && /^\d+$/.test(raw)) {
        sunRaw = raw;
        fetchedFromTronWeb = true;
        balanceAvailable = true;
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
        const exactNumber = typeof data.balanceSun !== "number" || Number.isSafeInteger(data.balanceSun);
        if (data.success && exactNumber && (typeof data.balanceSun === "number" || typeof data.balanceSun === "string") && /^\d+$/.test(String(data.balanceSun))) {
          sunRaw = String(data.balanceSun);
          balanceAvailable = true;
        }
      }
    } catch (err) {
      console.warn("Server-side TronGrid account query failed:", err);
    }
  }

  if (!balanceAvailable) {
    return { trx: "UNAVAILABLE", usdd: "UNAVAILABLE", usdt: "UNAVAILABLE" };
  }

  if (!sunRaw) return { trx: "UNAVAILABLE", usdd: "UNAVAILABLE", usdt: "UNAVAILABLE" };
  const trx = formatUnits(sunRaw, 6);

  return { trx, usdd: "UNAVAILABLE", usdt: "UNAVAILABLE", rawSun: sunRaw };
}

/** Reads the connected Nile wallet's actual jTRX balance using the verified 8-decimal token ABI. */
export async function fetchNileJTrxBalance(
  address: string,
  tronWebInstance?: any,
  network: TronNetwork = "nile"
): Promise<string | null> {
  if (!address || network !== "nile") return null;
  const tw = tronWebInstance || (typeof window !== "undefined" ? (window as any).tronWeb : null);
  if (!tw) return null;
  try {
    const contract = await tw.contract(JTRX_ABI, JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58);
    const rawBalance = await contract.balanceOf(address).call();
    const rawText = String(rawBalance);
    const exactNumber = typeof rawBalance !== "number" || Number.isSafeInteger(rawBalance);
    if (!exactNumber || !/^\d+$/.test(rawText)) return null;
    return formatUnits(rawText, JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.decimals);
  } catch (err) {
    console.warn("Nile jTRX balance query failed:", err);
    return null;
  }
}

/** Reads the Nile jTRX stored exchange-rate mantissa for a redeem estimate. */
export async function fetchNileJTrxExchangeRate(
  tronWebInstance?: any,
  network: TronNetwork = "nile"
): Promise<{ raw: string; fetchedAt: string } | null> {
  if (network !== "nile") return null;
  const tw = tronWebInstance || (typeof window !== "undefined" ? (window as any).tronWeb : null);
  if (!tw) return null;
  try {
    const contract = await tw.contract(JTRX_ABI, JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.base58);
    const rawValue = await contract.exchangeRateStored().call();
    const raw = String(rawValue);
    const exactNumber = typeof rawValue !== "number" || Number.isSafeInteger(rawValue);
    if (!exactNumber || !/^\d+$/.test(raw) || raw === "0") return null;
    return { raw, fetchedAt: new Date().toISOString() };
  } catch (err) {
    console.warn("Nile jTRX exchange rate query failed:", err);
    return null;
  }
}

/** Estimates TRX redeemed from a human jTRX amount using the current Nile rate.
 * Compound exchangeRateStored is scaled by 1e18 and maps raw jToken units to
 * raw underlying units; flooring to sun avoids promising an unrepresentable fraction.
 */
export function estimateNileJTrxRedeemTrx(amountJTrx: string, exchangeRateRaw: string): string | null {
  const exactAmountRaw = parseUnitsExact(amountJTrx, JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.decimals);
  if (exactAmountRaw === null || !/^\d+$/.test(exchangeRateRaw)) return null;
  try {
    const amountRaw = new Decimal(exactAmountRaw);
    const rate = new Decimal(exchangeRateRaw);
    if (!amountRaw.isFinite() || !amountRaw.gt(0) || !rate.isFinite() || !rate.gt(0)) return null;
    const underlyingRaw = amountRaw.times(rate).div(new Decimal(10).pow(18)).floor();
    return formatUnits(underlyingRaw.toFixed(0), JUSTLEND_NILE_CONTRACTS.jTokens.jTRX.underlyingDecimals ?? 6);
  } catch {
    return null;
  }
}
